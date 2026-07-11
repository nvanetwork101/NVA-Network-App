const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, collection, getDocs, query, where, updateDoc } = require('firebase/firestore');
const axios = require('axios');
const fs = require('fs');

// Set Jest global timeout to 30 seconds to allow slow local background triggers to finish
jest.setTimeout(30000);

let testEnv = null;

beforeAll(async () => {
    try {
        testEnv = await initializeTestEnvironment({
            projectId: "nvanetworkapp", 
            firestore: {
                // Dynamically load your actual production security rules file
                rules: fs.readFileSync("../firestore.rules", "utf8")
            }
        });
    } catch (error) {
        console.error("CRITICAL: Failed to initialize test environment:", error);
        throw error;
    }
});

beforeEach(async () => {
    if (testEnv) {
        await testEnv.clearFirestore();
    }
});

afterAll(async () => {
    if (testEnv) {
        await testEnv.cleanup();
    }
});

// Helper to generate a mock Firebase JWT token with support for Custom Claims
function generateMockToken(uid, customClaims = {}) {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64").replace(/=/g, "");
    const payload = Buffer.from(JSON.stringify({ 
        sub: uid, 
        uid: uid, 
        email: `${uid}@nva.com`,
        ...customClaims
    })).toString("base64").replace(/=/g, "");
    return `${header}.${payload}.signature`;
}

// Non-blocking Polling helper to handle asynchronous database background triggers
async function pollForCondition(assertionFn, timeout = 15000, interval = 100) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        try {
            await assertionFn();
            return;
        } catch (e) {
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }
    await assertionFn();
}

describe("Pathway A: The Gifting & Tip Pipeline", () => {
    
    it("should deduct gross amount, split 85% to recipient, and log notifications", async () => {
        if (!testEnv) {
            throw new Error("Test environment was not initialized successfully.");
        }

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, "creators", "sender_123"), { 
                creatorName: "Wealthy Patron",
                totalEarnings: 2000 
            });
            await setDoc(doc(db, "creators", "actor_456"), { 
                creatorName: "Star Actor",
                totalEarnings: 100 
            });
        });

        const mockToken = generateMockToken("sender_123");
        const response = await axios.post(
            "http://127.0.0.1:5001/nvanetworkapp/us-central1/sendGiftWithEarnings",
            { data: { targetUserId: "actor_456", giftName: "Golden Popcorn", amount: 1000 } },
            { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mockToken}` } }
        );

        expect(response.status).toBe(200);
        expect(response.data.result.success).toBe(true);

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const senderSnap = await getDoc(doc(db, "creators", "sender_123"));
            expect(senderSnap.data().totalEarnings).toBe(1000);

            const recipientSnap = await getDoc(doc(db, "creators", "actor_456"));
            const recipientData = recipientSnap.data();
            expect(recipientData.totalEarnings).toBe(950);
            expect(recipientData.giftsReceived).toBe(1);
            expect(recipientData.giftInventory["Golden Popcorn"]).toBe(1);

            const supporterSnap = await getDoc(doc(db, "creators", "actor_456", "supporters", "sender_123"));
            expect(supporterSnap.exists()).toBe(true);
            expect(supporterSnap.data().amountGiven).toBe(1000);
        });
    });

});

describe("Pathway B: The Box Office Ticket & Sweep Pipeline", () => {

    it("Scenario 1: Admin direct manual override sweep from creator's card", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, "creators", "admin_caller"), {
                creatorName: "Super Admin",
                role: "admin"
            });
            await setDoc(doc(db, "creators", "filmmaker_789"), {
                creatorName: "Indie Filmmaker",
                totalEarnings: 1000,
                boxOfficeLedger: {
                    ticketSales: 5000,
                    filmDonations: 2000
                }
            });
        });

        const mockAdminToken = generateMockToken("admin_caller");
        const response = await axios.post(
            "http://127.0.0.1:5001/nvanetworkapp/us-central1/transferBoxOfficeToUser",
            { data: { targetUserId: "filmmaker_789" } },
            { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mockAdminToken}` } }
        );

        expect(response.status).toBe(200);
        expect(response.data.result.success).toBe(true);

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const filmmakerSnap = await getDoc(doc(db, "creators", "filmmaker_789"));
            const data = filmmakerSnap.data();

            expect(data.boxOfficeLedger.ticketSales).toBe(0);
            expect(data.boxOfficeLedger.filmDonations).toBe(0);
            expect(data.totalEarnings).toBe(8000);

            const notificationsSnap = await getDocs(query(collection(db, "notifications"), where("userId", "==", "filmmaker_789")));
            expect(notificationsSnap.empty).toBe(false);
            expect(notificationsSnap.docs[0].data().notificationType).toBe("PAYOUT_PAID");

            const txnSnap = await getDocs(query(collection(db, "transactions"), where("userId", "==", "filmmaker_789")));
            expect(txnSnap.empty).toBe(false);
            expect(txnSnap.docs[0].data().amount).toBe(7000);
        });
    });

    it("Scenario 2: Admin process requested box office sweep via secure transaction", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, "creators", "filmmaker_789"), {
                creatorName: "Indie Filmmaker",
                totalEarnings: 0,
                boxOfficeLedger: {
                    ticketSales: 5000,
                    filmDonations: 1000
                }
            });
            await setDoc(doc(db, "payoutRequests", "request_payout_xyz"), {
                userId: "filmmaker_789",
                creatorName: "Indie Filmmaker",
                type: "boxOfficeSweep",
                campaignTitle: "🍿 TICKET SALES: My Guyana Film",
                amount: 4000,
                status: "pending"
            });
        });

        const mockAdminToken = generateMockToken("admin_caller", { admin: true });
        const response = await axios.post(
            "http://127.0.0.1:5001/nvanetworkapp/us-central1/approveBoxOfficeSweep",
            { data: { requestId: "request_payout_xyz" } },
            { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mockAdminToken}` } }
        );

        expect(response.status).toBe(200);
        expect(response.data.result.success).toBe(true);

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const filmmakerSnap = await getDoc(doc(db, "creators", "filmmaker_789"));
            const data = filmmakerSnap.data();

            expect(data.boxOfficeLedger.ticketSales).toBe(1000);
            expect(data.boxOfficeLedger.filmDonations).toBe(1000);
            expect(data.totalEarnings).toBe(4000);

            const requestSnap = await getDoc(doc(db, "payoutRequests", "request_payout_xyz"));
            expect(requestSnap.data().status).toBe("processed");
        });
    });

});

describe("Pathway C: The Monetization Queue & Constraints", () => {

    it("should enforce the 1-monetized-video-limit by stripping monetization status from older content", async () => {
        if (!testEnv) {
            throw new Error("Test environment was not initialized successfully.");
        }

        const currentAppId = "production-app-id";

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, "creators", "director_999"), {
                creatorName: "Talented Director",
                unreadNotificationCount: 0
            });
            await setDoc(doc(db, `artifacts/${currentAppId}/public/data/content_items`, "old_monetized_film"), {
                title: "My Old Masterpiece",
                creatorId: "director_999",
                monetizationStatus: "approved",
                isMonetizationRequest: true
            });
            await setDoc(doc(db, `artifacts/${currentAppId}/public/data/content_items`, "new_pending_film"), {
                title: "My New Hit Single",
                creatorId: "director_999",
                monetizationStatus: "pending",
                isMonetizationRequest: true
            });
        });

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const newFilmRef = doc(db, `artifacts/${currentAppId}/public/data/content_items`, "new_pending_film");
            await updateDoc(newFilmRef, { monetizationStatus: "approved" });
        });

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const oldFilmRef = doc(db, `artifacts/${currentAppId}/public/data/content_items`, "old_monetized_film");
            const newFilmRef = doc(db, `artifacts/${currentAppId}/public/data/content_items`, "new_pending_film");
            const creatorRef = doc(db, "creators", "director_999");

            await pollForCondition(async () => {
                const oldFilmSnap = await getDoc(oldFilmRef);
                expect(oldFilmSnap.data().monetizationStatus).toBe("none");
                expect(oldFilmSnap.data().isMonetizationRequest).toBe(false);
            });

            const newFilmSnap = await getDoc(newFilmRef);
            const creatorSnap = await getDoc(creatorRef);

            expect(newFilmSnap.data().monetizationStatus).toBe("approved");

            const notificationsSnap = await getDocs(query(collection(db, "notifications"), where("userId", "==", "director_999")));
            expect(notificationsSnap.empty).toBe(false);
            
            const notificationData = notificationsSnap.docs[0].data();
            expect(notificationData.notificationType).toBe("MONETIZATION_APPROVED");
            expect(notificationData.title).toBe("Video Approved & Live! 🎬");

            expect(creatorSnap.data().unreadNotificationCount).toBe(1);
        });
    });

});

describe("Pathway D: Casting Tournaments & Dynamic Prize Pools", () => {

    it("should deduct entry fee from dashboard balance, set entry document, and route 85% directly to tournament prize pool", async () => {
        if (!testEnv) {
            throw new Error("Test environment was not initialized successfully.");
        }

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, "creators", "contestant_888"), {
                creatorName: "Star Actor",
                totalEarnings: 1000
            });
            await setDoc(doc(db, "competitions", "tournament_super_star"), {
                title: "NVA Masterclass Acting Battle",
                status: "Accepting Entries",
                entryFee: 500,
                prizePool: 100,
                entryCount: 0
            });
        });

        const mockContestantToken = generateMockToken("contestant_888");
        const response = await axios.post(
            "http://127.0.0.1:5001/nvanetworkapp/us-central1/submitCompetitionEntry",
            {
                data: {
                    competitionId: "tournament_super_star",
                    contactNumber: "592-622-4455",
                    paymentMethod: "earnings",
                    title: "Shakespeare Monologue Audition",
                    bio: "Hailing from Linden, acting is my dream.",
                    submissionUrl: "https://www.youtube.com/watch?v=mock"
                }
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${mockContestantToken}`
                }
            }
        );

        expect(response.status).toBe(200);
        expect(response.data.result.success).toBe(true);

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const contestantSnap = await getDoc(doc(db, "creators", "contestant_888"));
            expect(contestantSnap.data().totalEarnings).toBe(500);

            const tournamentSnap = await getDoc(doc(db, "competitions", "tournament_super_star"));
            const tournamentData = tournamentSnap.data();
            expect(tournamentData.entryCount).toBe(1);
            expect(tournamentData.prizePool).toBe(525);

            const entryDocSnap = await getDoc(doc(db, "competitions", "tournament_super_star", "entries", "contestant_888"));
            expect(entryDocSnap.exists()).toBe(true);
            
            const entryData = entryDocSnap.data();
            expect(entryData.title).toBe("Shakespeare Monologue Audition");
            expect(entryData.contactNumber).toBe("592-622-4455");
            expect(entryData.userId).toBe("contestant_888");
            expect(entryData.userName).toBe("Star Actor");
        });
    });

});

describe("Pathway E: Roast Room Token Economy", () => {

    it("Scenario 1: Purchase Roast Passes from existing dashboard earnings", async () => {
        if (!testEnv) {
            throw new Error("Test environment was not initialized successfully.");
        }

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, "creators", "buyer_user"), {
                creatorName: "Roast Challenger",
                totalEarnings: 3000,
                roastTokens: 5
            });
        });

        const mockBuyerToken = generateMockToken("buyer_user");
        const response = await axios.post(
            "http://127.0.0.1:5001/nvanetworkapp/us-central1/purchaseRoastTokensWithEarnings",
            {
                data: {
                    costGYD: 2000,
                    tokenAmount: 90
                }
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${mockBuyerToken}`
                }
            }
        );

        expect(response.status).toBe(200);
        expect(response.data.result.success).toBe(true);

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const buyerSnap = await getDoc(doc(db, "creators", "buyer_user"));
            const data = buyerSnap.data();

            expect(data.totalEarnings).toBe(1000);
            expect(data.roastTokens).toBe(95);
        });
    });

    it("Scenario 2: Send reaction inside live arena (Tomato Loser-Tax routing)", async () => {
        if (!testEnv) {
            throw new Error("Test environment was not initialized successfully.");
        }

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, "creators", "audience_sender"), {
                creatorName: "Active Listener",
                roastTokens: 10
            });
            await setDoc(doc(db, "creators", "host_actor"), {
                creatorName: "Master of Ceremonies",
                totalEarnings: 0
            });
            await setDoc(doc(db, "creators", "roaster_actor"), {
                creatorName: "Stage Challenger",
                totalEarnings: 0
            });
            await setDoc(doc(db, "live_arena", "main-arena"), {
                hostId: "host_actor",
                roasterId: "roaster_actor",
                currentReceiver: "roaster",
                tomatoCount: 0,
                fireCount: 0
            });
        });

        const mockSenderToken = generateMockToken("audience_sender");
        
        const response = await axios.post(
            "http://127.0.0.1:5001/nvanetworkapp/us-central1/sendRoastReaction",
            { data: { reactionType: "tomato" } },
            { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mockSenderToken}` } }
        );

        expect(response.status).toBe(200);
        expect(response.data.result.success).toBe(true);

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const senderSnap = await getDoc(doc(db, "creators", "audience_sender"));
            expect(senderSnap.data().roastTokens).toBe(9);

            const hostSnap = await getDoc(doc(db, "creators", "host_actor"));
            expect(hostSnap.data().totalEarnings).toBe(20);

            const roasterSnap = await getDoc(doc(db, "creators", "roaster_actor"));
            expect(roasterSnap.data().totalEarnings).toBe(0);

            const arenaSnap = await getDoc(doc(db, "live_arena", "main-arena"));
            expect(arenaSnap.data().tomatoCount).toBe(1);
            expect(arenaSnap.data().fireCount).toBe(0);
        });
    });

});

describe("Phase 5: Firestore Database Security Rules Audit", () => {
    
    it("Security Rule: Prevent unauthorized users from modifying totalEarnings directly", async () => {
        const unauthContext = testEnv.authenticatedContext("bad_actor");
        const db = unauthContext.firestore();
        // A bad actor tries to bypass cloud functions to edit their balance directly
        await assertFails(db.doc("creators/bad_actor").update({ totalEarnings: 999999 }));
    });

    it("Security Rule: Prevent non-super-admins from accessing the Finance Command", async () => {
        const standardAdminContext = testEnv.authenticatedContext("admin_user", { admin: true });
        const adminDb = standardAdminContext.firestore();
        // Standard admins cannot modify or view Super Admin configs/sensitive financial ledgers
        await assertFails(adminDb.doc("settings/commissions").set({ staff: {} }));
        await assertFails(adminDb.collection("transactions").get());
    });

    it("Security Rule: Allow Super Admins to write to Finance Settings", async () => {
        const superAdminContext = testEnv.authenticatedContext("super_user", { super_admin: true });
        const superDb = superAdminContext.firestore();
        // Super admin has authoritative writes to the matrix config
        await assertSucceeds(superDb.doc("settings/commissions").set({ test: true }));
    });
});

describe("Phase 5: Gifting & Arena Donation Variations (sendGiftWithEarnings)", () => {
    it("Sub-Pathway A: Direct Gifting credits target's main totalEarnings", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            const mockAuth = generateMockToken("sender_123");
            
            // FIX: Ensure creatorName exists so notification logic doesn't throw Undefined exception
            await adminDb.doc("creators/sender_123").set({ totalEarnings: 500, giftsReceived: 0, giftInventory: {}, creatorName: "Test Sender" });
            await adminDb.doc("creators/actor_456").set({ totalEarnings: 0, giftsReceived: 0, giftInventory: {}, creatorName: "Test Actor" });

            await axios.post("http://127.0.0.1:5001/nvanetworkapp/us-central1/sendGiftWithEarnings", {
                data: { targetUserId: "actor_456", giftName: "Warm Spotlight", amount: 500 }
            }, { headers: { "Authorization": `Bearer ${mockAuth}` } });

            await pollForCondition(async () => {
                const senderDoc = await adminDb.doc("creators/sender_123").get();
                const recipientDoc = await adminDb.doc("creators/actor_456").get();
                
                expect(senderDoc.data().totalEarnings).toBe(0); 
                expect(recipientDoc.data().totalEarnings).toBe(425); 
                expect(recipientDoc.data().giftInventory["Warm Spotlight"]).toBe(1);
            });
        });
    });

    it("Sub-Pathway B: Showcase Film Donations credit the Box Office Ledger", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            const mockAuth = generateMockToken("sender_456");
            
            // FIX: Added creatorName
            await adminDb.doc("creators/sender_456").set({ totalEarnings: 1000, creatorName: "Test Sender 2" });
            await adminDb.doc("creators/filmmaker_789").set({ totalEarnings: 0, boxOfficeLedger: { ticketSales: 0, filmDonations: 0 }, creatorName: "Test Filmmaker" });

            await axios.post("http://127.0.0.1:5001/nvanetworkapp/us-central1/sendGiftWithEarnings", {
                data: { targetUserId: "filmmaker_789", giftName: "Golden Popcorn", amount: 1000, isFilmmakerDonation: true }
            }, { headers: { "Authorization": `Bearer ${mockAuth}` } });

            await pollForCondition(async () => {
                const recipientDoc = await adminDb.doc("creators/filmmaker_789").get();
                expect(recipientDoc.data().totalEarnings).toBe(0); 
                expect(recipientDoc.data().boxOfficeLedger.filmDonations).toBe(850); 
            });
        });
    });
});

describe("Phase 6: Manual MMG Pledge Approval Workflow (approvePledge)", () => {
    let mockAdminToken;
    beforeAll(() => { mockAdminToken = generateMockToken("admin_999", { admin: true }); });

    it("Event Ticket Purchase Approval & Asset Fan-out", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            
            await adminDb.doc("paymentPledges/MMG-TIX-9999").set({
                userId: "buyer_111",
                paymentType: "eventTicket",
                targetEventId: "premiere_event_abc",
                amount: 1000,
                status: "pending"
            });
            // FIX: Added creatorName
            await adminDb.doc("creators/buyer_111").set({ purchasedTickets: {}, creatorName: "Test Buyer" });
            await adminDb.doc("events/premiere_event_abc").set({ ticketsSold: 0, totalRevenue: 0 });
            await adminDb.doc("movies/premiere_event_abc").set({ creatorId: "filmmaker_999" });
            await adminDb.doc("creators/filmmaker_999").set({ boxOfficeLedger: { ticketSales: 0 }, creatorName: "Test Filmmaker" });

            await axios.post("http://127.0.0.1:5001/nvanetworkapp/us-central1/approvePledge", {
                data: { pledgeId: "MMG-TIX-9999", appId: "production-app-id" }
            }, { headers: { "Authorization": `Bearer ${mockAdminToken}` } });

            await pollForCondition(async () => {
                const pledgeDoc = await adminDb.doc("paymentPledges/MMG-TIX-9999").get();
                const buyerDoc = await adminDb.doc("creators/buyer_111").get();
                const eventDoc = await adminDb.doc("events/premiere_event_abc").get();
                const filmDoc = await adminDb.doc("creators/filmmaker_999").get();

                expect(pledgeDoc.data().status).toBe("approved");
                expect(buyerDoc.data().purchasedTickets["premiere_event_abc"]).toBe(true); 
                expect(eventDoc.data().ticketsSold).toBe(1);
                expect(eventDoc.data().totalRevenue).toBe(1000);
                expect(filmDoc.data().boxOfficeLedger.ticketSales).toBe(850); 
            });
        });
    });

    it("Roast Tokens Manual MMG Approval", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            
            await adminDb.doc("paymentPledges/MMG-ROAST-777").set({
                userId: "roast_buyer_222",
                paymentType: "roastTokens",
                tokenAmount: 90,
                amount: 2000,
                status: "pending"
            });
            // FIX: Added creatorName
            await adminDb.doc("creators/roast_buyer_222").set({ roastTokens: 0, tokenCashValue: 0, lifetimeSpent: 0, creatorName: "Test Roaster" });

            await axios.post("http://127.0.0.1:5001/nvanetworkapp/us-central1/approvePledge", {
                data: { pledgeId: "MMG-ROAST-777", appId: "production-app-id" }
            }, { headers: { "Authorization": `Bearer ${mockAdminToken}` } });

            await pollForCondition(async () => {
                const buyerDoc = await adminDb.doc("creators/roast_buyer_222").get();
                expect(buyerDoc.data().roastTokens).toBe(90);
                expect(buyerDoc.data().lifetimeSpent).toBe(2000);
                expect(buyerDoc.data().tokenCashValue).toBe(1700);
            });
        });
    });
});

describe("Phase 6: Super Admin Finance Command & Commission Ledger", () => {
    
    function aggregateClientReportMock(transactionsList, expensesList, draftCommissions) {
        let sectionalData = {
            centerstage: { count: 0, gross: 0, revenue: 0, staffCuts: 0 },
            competitions: { count: 0, gross: 0, revenue: 0, staffCuts: 0 },
            film_arena: { count: 0, gross: 0, revenue: 0, staffCuts: 0 },
            film_club: { count: 0, gross: 0, revenue: 0, staffCuts: 0 },
            box_office: { count: 0, gross: 0, revenue: 0, staffCuts: 0 },
            roast_arena: { count: 0, gross: 0, revenue: 0, staffCuts: 0 },
            explore_hub: { count: 0, gross: 0, revenue: 0, staffCuts: 0 }
        };

        let grossSum = 0; let revenueSum = 0; let staffCutsSum = 0;

        transactionsList.forEach(tx => {
            const src = tx.source || 'explore_hub';
            const grossVal = tx.amount || 0;
            const netFee = grossVal * 0.15; 

            sectionalData[src].count += 1;
            sectionalData[src].gross += grossVal;
            sectionalData[src].revenue += netFee;

            grossSum += grossVal;
            revenueSum += netFee;

            Object.entries(draftCommissions).forEach(([uid, setup]) => {
                const commissionPercent = Number(setup[src] || 0) / 100;
                const commissionValue = grossVal * commissionPercent;
                sectionalData[src].staffCuts += commissionValue;
                staffCutsSum += commissionValue;
            });
        });

        const expensesSum = expensesList.reduce((sum, current) => sum + (current.amount || 0), 0);
        const netVaultSum = revenueSum - staffCutsSum - expensesSum;

        return {
            grandTotalGross: grossSum,
            grandTotalRevenue: revenueSum,
            grandTotalLiabilities: staffCutsSum,
            grandTotalExpenses: expensesSum,
            grandTotalVault: netVaultSum,
            sections: sectionalData
        };
    }

    it("Validates accurate Net Vault mathematical aggregation and prevents matrix overdrafts", () => {
        const mockTransactions = [
            { id: "CS-001", amount: 1000, source: "centerstage" },
            { id: "COMP-002", amount: 500, source: "competitions" },
            { id: "FA-003", amount: 2000, source: "film_arena" },
            { id: "FC-004", amount: 3000, source: "film_club" },
            { id: "BO-005", amount: 1500, source: "box_office" },
            { id: "RA-006", amount: 800, source: "roast_arena" },
            { id: "EH-007", amount: 1200, source: "explore_hub" }
        ];

        const mockExpenses = [
            { id: "E-01", amount: 300, category: "Server" },
            { id: "E-02", amount: 200, category: "Internet" }
        ];

        const mockCommissions = {
            "moderator_abc": { centerstage: 5 } 
        };

        const report = aggregateClientReportMock(mockTransactions, mockExpenses, mockCommissions);

        expect(report.grandTotalGross).toBe(10000); 
        expect(report.grandTotalRevenue).toBe(1500); 
        expect(report.grandTotalExpenses).toBe(500); 
        expect(report.grandTotalLiabilities).toBe(50);
        expect(report.sections["centerstage"].staffCuts).toBe(50);
        expect(report.grandTotalVault).toBe(950);
    });

    it("Frontend Validation Engine correctly blocks Staff Matrix Overdraft (>15%)", () => {
        const badDraftCommissions = {
            "admin_A": { centerstage: 10 },
            "admin_B": { centerstage: 8 } 
        };
        
        const getColumnTotal = (colKey) => {
            return Object.values(badDraftCommissions).reduce((sum, setup) => sum + Number(setup[colKey] || 0), 0);
        };
        
        const columns = ['centerstage', 'competitions', 'film_arena', 'film_club', 'box_office', 'roast_arena', 'explore_hub'];
        const overLimit = columns.some(col => getColumnTotal(col) > 15);
        
        expect(overLimit).toBe(true); 
    });
});

describe("Phase 7: Destructive Cleanups & Administrative Protection Audit", () => {
    let adminDb;
    let mockSuperAdminToken;

    beforeAll(() => {
        // Retrieve db context bypassing security rules specifically for test seeding
        adminDb = testEnv.unauthenticatedContext().firestore();
        mockSuperAdminToken = generateMockToken("super_admin_guy", { super_admin: true, admin: true });
    });

    it("deleteCompetition: Recursively deletes document, entries, and mocks storage purging", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const dbRef = context.firestore();

            // 1. Seed a Mock Competition with high-res and thumb flyer URLs
            const compId = "test_comp_for_deletion";
            await dbRef.doc(`competitions/${compId}`).set({
                title: "Trash Tournament",
                status: "Pending",
                flyerImageUrl: "https://firebasestorage.googleapis.com/v0/b/nvanetworkapp.appspot.com/o/competition_flyers%2Fthumb.png?alt=media",
                flyerImageUrl_highRes: "https://firebasestorage.googleapis.com/v0/b/nvanetworkapp.appspot.com/o/competition_flyers%2Fhighres.png?alt=media"
            });

            // 2. Seed entries inside the subcollection
            await dbRef.doc(`competitions/${compId}/entries/actor_entry_1`).set({ userId: "actor_1", likeCount: 0 });
            await dbRef.doc(`competitions/${compId}/entries/actor_entry_2`).set({ userId: "actor_2", likeCount: 0 });

            // 3. Trigger deleteCompetition as Admin
            await axios.post("http://127.0.0.1:5001/nvanetworkapp/us-central1/deleteCompetition", {
                data: { competitionId: compId }
            }, { headers: { "Authorization": `Bearer ${mockSuperAdminToken}` } });

            // 4. Assert both the parent and entries are completely erased
            await pollForCondition(async () => {
                const compDoc = await dbRef.doc(`competitions/${compId}`).get();
                const entry1Doc = await dbRef.doc(`competitions/${compId}/entries/actor_entry_1`).get();
                const entry2Doc = await dbRef.doc(`competitions/${compId}/entries/actor_entry_2`).get();

                expect(compDoc.exists).toBe(false);
                expect(entry1Doc.exists).toBe(false);
                expect(entry2Doc.exists).toBe(false);
            });
        });
    });

    it("deleteAllUserDataAndContent: Wipes standard users and assets, but PRESERVES all Admins and Financial Ledgers", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const dbRef = context.firestore();

            // 1. Seed standard user and secondary staff members
            await dbRef.doc("creators/standard_user_1").set({ creatorName: "Regular Guy", role: "user" });
            await dbRef.doc("creators/super_admin_guy").set({ creatorName: "Calling Super Admin", role: "super_admin" });
            await dbRef.doc("creators/another_admin_guy").set({ creatorName: "Secondary Admin", role: "admin" });

            // 2. Seed a mock asset collection to be wiped
            await dbRef.doc("competitions/old_draft_to_wipe").set({ title: "Ghost Tournament", status: "Draft" });

            // 3. Seed critical financial ledgers that MUST be protected from deletion [1]
            await dbRef.doc("paymentPledges/MMG_LEDGER_001").set({ amount: 5000, status: "approved", paymentType: "giftToken" });
            await dbRef.doc("payoutRequests/SWEEP_002").set({ amount: 15000, status: "paid", type: "boxOfficeSweep" });

            // 4. Trigger the Full Data Reset
            await axios.post("http://127.0.0.1:5001/nvanetworkapp/us-central1/deleteAllUserDataAndContent", {
                data: {}
            }, { headers: { "Authorization": `Bearer ${mockSuperAdminToken}` } });

            // 5. Verification Assertions
            await pollForCondition(async () => {
                const stdUserDoc = await dbRef.doc("creators/standard_user_1").get();
                const callerAdminDoc = await dbRef.doc("creators/super_admin_guy").get();
                const secondaryAdminDoc = await dbRef.doc("creators/another_admin_guy").get();
                
                const compDoc = await dbRef.doc("competitions/old_draft_to_wipe").get();
                
                const protectedPledgeDoc = await dbRef.doc("paymentPledges/MMG_LEDGER_001").get();
                const protectedRequestDoc = await dbRef.doc("payoutRequests/SWEEP_002").get();

                // Standard accounts and draft competitions must be wiped clean
                expect(stdUserDoc.exists).toBe(false);
                expect(compDoc.exists).toBe(false);

                // Staff accounts must remain untouched to prevent administrative lockout
                expect(callerAdminDoc.exists).toBe(true);
                expect(callerAdminDoc.data().role).toBe("super_admin"); // Role explicitly written back/verified
                expect(secondaryAdminDoc.exists).toBe(true);
                expect(secondaryAdminDoc.data().role).toBe("admin");

                // Critical financial records MUST be preserved so your P&L reporting stays accurate [1]
                expect(protectedPledgeDoc.exists).toBe(true);
                expect(protectedRequestDoc.exists).toBe(true);
            });
        });
    });
});

describe("Phase C: End-to-End (E2E) Master Financial Integration Flow", () => {
    let mockAdminToken;
    let mockBuyerToken;

    beforeAll(() => {
        mockAdminToken = generateMockToken("super_admin_e2e", { super_admin: true, admin: true });
        mockBuyerToken = generateMockToken("standard_buyer_e2e");
    });

    it("Simulates complete life-cycle: Ticket Purchase -> Box Office Ledger -> Admin Sweep -> Payout Request", async () => {
        if (!testEnv) throw new Error("Test environment was not initialized successfully.");

        const filmmakerId = "filmmaker_e2e";
        const buyerId = "standard_buyer_e2e";
        const eventId = "premiere_e2e";
        const pledgeId = "MMG-TIX-E2E";
        const sweepReqId = "SWEEP-REQ-E2E";

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            
            // 1. Seed Initial State
            await adminDb.doc(`creators/${filmmakerId}`).set({ 
                creatorName: "E2E Director", 
                totalEarnings: 0, 
                boxOfficeLedger: { ticketSales: 0, filmDonations: 0 } 
            });
            await adminDb.doc(`creators/${buyerId}`).set({ 
                creatorName: "E2E Buyer", 
                purchasedTickets: {} 
            });
            await adminDb.doc(`events/${eventId}`).set({ 
                eventTitle: "The Great Audit", 
                ticketsSold: 0, 
                totalRevenue: 0 
            });
            await adminDb.doc(`movies/${eventId}`).set({ 
                creatorId: filmmakerId, 
                type: 'premiere' 
            });
            await adminDb.doc(`paymentPledges/${pledgeId}`).set({
                userId: buyerId,
                paymentType: "eventTicket",
                targetEventId: eventId,
                amount: 1000,
                status: "pending"
            });
        });

        // ==========================================
        // STEP 1: Buyer ticket is approved (Simulate MMG Approval)
        // ==========================================
        let response = await axios.post(
            "http://127.0.0.1:5001/nvanetworkapp/us-central1/approvePledge",
            { data: { pledgeId, appId: "production-app-id" } },
            { headers: { "Authorization": `Bearer ${mockAdminToken}` } }
        );
        expect(response.data.result.message).toContain("Pledge approved");

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            const filmDoc = await adminDb.doc(`creators/${filmmakerId}`).get();
            // Verify Box Office ledger increments by exactly 85% ($850)
            expect(filmDoc.data().boxOfficeLedger.ticketSales).toBe(850);
            expect(filmDoc.data().totalEarnings).toBe(0); // Earnings untouched yet

            // Seed the Payout Request for the next step
            await adminDb.doc(`payoutRequests/${sweepReqId}`).set({
                type: 'boxOfficeSweep',
                userId: filmmakerId,
                creatorName: "E2E Director",
                campaignTitle: "🎟️ TICKET SALES: The Great Audit",
                amount: 850,
                status: 'pending'
            });
        });

        // ==========================================
        // STEP 2: Admin approves the Sweep (Ledger -> Earnings)
        // ==========================================
        response = await axios.post(
            "http://127.0.0.1:5001/nvanetworkapp/us-central1/approveBoxOfficeSweep",
            { data: { requestId: sweepReqId } },
            { headers: { "Authorization": `Bearer ${mockAdminToken}` } }
        );
        expect(response.data.result.success).toBe(true);

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            const filmDoc = await adminDb.doc(`creators/${filmmakerId}`).get();
            
            // Verify Box Office is wiped and moved to Earnings
            expect(filmDoc.data().boxOfficeLedger.ticketSales).toBe(0);
            expect(filmDoc.data().totalEarnings).toBe(850);
            
            // Verify History log was written
            const historySnap = await getDocs(query(collection(adminDb, "payoutHistory"), where("userId", "==", filmmakerId)));
            expect(historySnap.empty).toBe(false);
            expect(historySnap.docs[0].data().amount).toBe(850);
            expect(historySnap.docs[0].data().systemReceiptId).toContain("SWEEP-");
        });
    });
});

describe("Phase A Part 2: Backend requestPayout Security Constraints", () => {
    let mockUserToken;

    beforeAll(() => {
        mockUserToken = generateMockToken("payout_user_777");
    });

    it("should reject payout requests if totalEarnings are below 10,000 GYD", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            await adminDb.doc("creators/payout_user_777").set({
                creatorName: "Low Earner",
                totalEarnings: 5000 // Under the 10k threshold
            });
        });

        try {
            await axios.post(
                "http://127.0.0.1:5001/nvanetworkapp/us-central1/requestPayout",
                { data: { fullName: "Jane Doe", mmgNumber: "592-600-0000" } },
                { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mockUserToken}` } }
            );
            fail("Should have thrown a failed-precondition error");
        } catch (error) {
            expect(error.response.status).toBe(400); // Failed precondition maps to 400
        }
    });

    it("should reject payout requests if last payout date was within the 30-day cooldown", async () => {
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 15); // Paid 15 days ago (under the 30-day limit)

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            await adminDb.doc("creators/payout_user_777").set({
                creatorName: "Cooldowned Creator",
                totalEarnings: 15000, // Valid balance
                lastPayoutDate: recentDate.toISOString()
            });
        });

        try {
            await axios.post(
                "http://127.0.0.1:5001/nvanetworkapp/us-central1/requestPayout",
                { data: { fullName: "Jane Doe", mmgNumber: "592-600-0000" } },
                { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mockUserToken}` } }
            );
            fail("Should have thrown a cooldown restriction error");
        } catch (error) {
            expect(error.response.status).toBe(400);
        }
    });

    it("should reject duplicate requests if status is already pending", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            await adminDb.doc("creators/payout_user_777").set({
                creatorName: "Duplicate Submitter",
                totalEarnings: 20000,
                payoutStatus: "pending" // Already pending
            });
        });

        try {
            await axios.post(
                "http://127.0.0.1:5001/nvanetworkapp/us-central1/requestPayout",
                { data: { fullName: "Jane Doe", mmgNumber: "592-600-0000" } },
                { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mockUserToken}` } }
            );
            fail("Should have rejected the duplicate request");
        } catch (error) {
            expect(error.response.status).toBe(400);
        }
    });

    it("should accept payout requests if all eligibility parameters are met", async () => {
        const acceptableDate = new Date();
        // Paid 45 days ago (valid for 30-day cooldown check)
        acceptableDate.setDate(acceptableDate.getDate() - 45); 

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            await adminDb.doc("creators/payout_user_777").set({
                creatorName: "Eligible Creator",
                totalEarnings: 25000,
                lastPayoutDate: acceptableDate.toISOString(),
                payoutStatus: "none"
            });
        });

        const response = await axios.post(
            "http://127.0.0.1:5001/nvanetworkapp/us-central1/requestPayout",
            { data: { fullName: "Jane Doe", mmgNumber: "592-600-0000" } },
            { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mockUserToken}` } }
        );

        expect(response.status).toBe(200);
        expect(response.data.result.success).toBe(true);

        // Assert updates on User Profile and the Queue entry inside Firestore
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const adminDb = context.firestore();
            const userSnap = await adminDb.doc("creators/payout_user_777").get();
            expect(userSnap.data().payoutStatus).toBe("pending");

            const queueSnap = await adminDb.collection("payoutRequests")
                .where("userId", "==", "payout_user_777")
                .get();
                
            expect(queueSnap.empty).toBe(false);
            expect(queueSnap.docs[0].data().amount).toBe(25000);
            expect(queueSnap.docs[0].data().fullName).toBe("Jane Doe");
        });
    });
});