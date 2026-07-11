// FORCED UPDATE: 2025-10-04 23:59
// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const {FieldValue} = require("firebase-admin/firestore"); // <-- ADD THIS LINE
const {onValueWritten} = require("firebase-functions/v2/database");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentUpdated, onDocumentDeleted, onDocumentCreated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");

// The Firebase Admin SDK to access Firestore.
const admin = require("firebase-admin");
admin.initializeApp({
    databaseURL: "https://nvanetworkapp-default-rtdb.firebaseio.com/",
    storageBucket: "nvanetworkapp.firebasestorage.app"
});

const PLATFORM_FEE_PERCENTAGE = 0.15; // Updated to 15% NVA CenterStage Fee

    // =====================================================================
// ============ START: SECURE USER PROFILE CREATION ====================
// =====================================================================
exports.createUserProfile = onCall(async (request) => {
    const { uid, email, role } = request.data;
    const callingUid = request.auth.uid;

    if (callingUid !== uid) {
        throw new HttpsError("permission-denied", "You can only create a profile for your own account.");
    }
    if (!uid || !email || !role) {
        throw new HttpsError("invalid-argument", "Missing required user information.");
    }

    const db = admin.firestore();
    const userRef = db.collection("creators").doc(uid);

    const baseProfile = {
        email: email,
        profilePictureUrl: '',
        createdAt: new Date().toISOString(),
        banned: false,
        followerCount: 0,
        followingCount: 0,
        unreadNotificationCount: 0
    };

    let userProfileData;

    const { creatorField, creatorName, bio, categories, existingWorkLink } = request.data;
    // THE FIX: Automatically promote to 'creator' if they selected a field [1]
    const isChoosingCreator = role === 'creator' || !!creatorField;

    if (isChoosingCreator) {
        userProfileData = {
            ...baseProfile,
            role: 'creator',
            creatorField: creatorField || "",
            creatorName: creatorName || email.split('@')[0],
            bio: bio || "",
            categories: categories || [],
            existingWorkLink: existingWorkLink || ""
        };
    } else {
        userProfileData = {
            ...baseProfile,
            role: 'user',
            creatorName: email.split('@')[0],
            bio: "",
            categories: [],
            existingWorkLink: ""
        };
    }

    try {
        await userRef.set(userProfileData);
        logger.info(`Successfully created '${role}' profile for user '${uid}'.`);
        return { success: true };
    } catch (error) {
        logger.error(`Error creating profile for user '${uid}':`, error);
        throw new HttpsError("internal", "An unexpected error occurred.");
    }
});
// =====================================================================
// ============== END: SECURE USER PROFILE CREATION ====================
// =====================================================================```


  // =====================================================================
// ============ START: NEW COLLECTION-TRIGGERED NOTIFICATION SYSTEM ====
// =====================================================================

exports.sendNotificationOnCreate = onDocumentCreated("notifications/{notificationId}", async (event) => {
    const notificationData = event.data.data();
    if (!notificationData) return null;

    const notificationId = event.params.notificationId;
    const notificationRef = event.data.ref;
    const db = admin.firestore();

    const now = new Date();
    const notificationType = notificationData.notificationType || "";
    const deliveryType = notificationData.deliveryType || [];

    // --- STEP 1: RESOLVE CATEGORY LIFESPAN (TTL) ---
    // Category 1: The Vault (Financials, Approvals & Admissions) -> Excluded from TTL (No expiry)
    const vaultTypes = [
        "Pledge Approved", "GIFT_RECEIVED", "ENTRY_APPROVED", "MONETIZATION_APPROVED",
        "PAYOUT_PAID", "PAYOUT_DISMISSED", "OPPORTUNITY_APPROVED", "OPPORTUNITY_REJECTED",
        "CONTENT_REMOVED", "COOLDOWN_LIFTED"
    ];

    let expiresAt = null;

    if (vaultTypes.includes(notificationType)) {
        expiresAt = null; // Stored indefinitely
    } else if (!deliveryType.includes("inbox")) {
        // Category 3 & 4: Transient alerts & DMs -> Auto-expire after 2 hours to prevent database clutter
        expiresAt = new Date(now.getTime() + (2 * 60 * 60 * 1000));
    } else {
        // Category 2: Time-Sensitive General Notifications -> Auto-expire after 7 days
        expiresAt = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
    }

    // --- STEP 2: HANDLE NON-PUSH PAYLOADS IMMEDIATELY ---
    if (!deliveryType.includes('push')) {
        const updates = { status: "sent", processedAt: now };
        if (expiresAt) {
            updates.expiresAt = admin.firestore.Timestamp.fromDate(expiresAt);
        }
        await notificationRef.update(updates);
        return null;
    }

    // --- STEP 3: EXECUTE PUSH NOTIFICATION DELIVERY ---
    const { userId, title, body, link } = notificationData;
    if (!userId || !title || !body) {
        logger.warn(`[Push Send] Notification '${notificationId}' is missing required fields (userId, title, or body).`);
        const updates = { status: "error", errorMessage: "Missing required fields.", processedAt: now };
        if (expiresAt) {
            updates.expiresAt = admin.firestore.Timestamp.fromDate(expiresAt);
        }
        await notificationRef.update(updates);
        return null;
    }

    logger.info(`[Push Send] Processing push notification '${notificationId}' for user '${userId}'.`);
    const userRef = db.collection("creators").doc(userId);

    try {
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            throw new Error(`User document not found for userId: ${userId}`);
        }

        const tokens = userDoc.data().fcmTokens || [];
        if (tokens.length === 0) {
            logger.info(`[Push Send] User '${userId}' has no FCM tokens. Marking as sent.`);
            const updates = { status: "sent", processedAt: now };
            if (expiresAt) {
                updates.expiresAt = admin.firestore.Timestamp.fromDate(expiresAt);
            }
            await notificationRef.update(updates);
            return null;
        }

        // Retrieve the user's active unread badge count
        const unreadCount = userDoc.data().unreadNotificationCount || 0;

        const message = {
            // 1. Notification block forces the popup to appear on screen
            notification: {
                title: title,
                body: body,
            },
            // 2. Data block keeps your frontend routing intact
            data: {
                title: title,
                body: body,
                link: link || '/'
            },
            // 3. APNS block updates the iOS home screen icon badge count natively
            apns: {
                payload: {
                    aps: {
                        badge: unreadCount,
                        sound: "default"
                    }
                }
            },
            tokens: tokens,
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        
        const tokensToDelete = [];
        response.responses.forEach((result, index) => {
            if (!result.success) {
                const error = result.error;
                logger.warn(`Failed to send to a token for user ${userId}`, { errorCode: error.code });
                if (error.code === 'messaging/registration-token-not-registered' ||
                    error.code === 'messaging/invalid-registration-token') {
                    tokensToDelete.push(tokens[index]);
                }
            }
        });

        if (tokensToDelete.length > 0) {
            await userRef.update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToDelete) });
            logger.info(`[Push Send] Cleaned up ${tokensToDelete.length} stale tokens for user '${userId}'.`);
        }

        const updates = { status: "sent", processedAt: now };
        if (expiresAt) {
            updates.expiresAt = admin.firestore.Timestamp.fromDate(expiresAt);
        }
        await notificationRef.update(updates);
        logger.info(`[Push Send] Successfully sent push notification '${notificationId}' to user '${userId}'.`);

    } catch (error) {
        logger.error(`[Push Send] A fatal error occurred while processing notification '${notificationId}' for user '${userId}'`, { error: error.message });
        const updates = { status: "error", errorMessage: error.message, processedAt: now };
        if (expiresAt) {
            updates.expiresAt = admin.firestore.Timestamp.fromDate(expiresAt);
        }
        await notificationRef.update(updates);
    }
    return null;
});

// =====================================================================
// ============= END: NEW COLLECTION-TRIGGERED NOTIFICATION SYSTEM =====
// =====================================================================

// =====================================================================
// ============ START: USER PRESENCE SYSTEM (REALTIME DB) ==============
// =====================================================================
exports.onUserStatusChanged = onValueWritten("/status/{uid}", async (event) => {
    const db = admin.firestore();
    const { uid } = event.params;
    const userStatusRef = db.doc(`creators/${uid}`);

    // Case 1: The user's status record was deleted (unclean disconnect).
    if (!event.data.after.exists()) {
        logger.info(`[Presence] User '${uid}' disconnected uncleanly. Setting status to offline.`);
        return userStatusRef.set({
            isOnline: false,
            lastSeen: new Date().toISOString()
        }, { merge: true });
    }

    const status = event.data.after.val();
    if (!status || !status.state) {
        return null; // No valid state to process.
    }

    // Case 2: The user's status is explicitly 'online'.
    if (status.state === 'online') {
        logger.info(`[Presence] User '${uid}' connected. Setting status to online.`);
        return userStatusRef.set({
            isOnline: true,
        }, { merge: true });
    }
    
    // Case 3: The user's status is explicitly 'offline' (graceful logout).
    if (status.state === 'offline') {
        logger.info(`[Presence] User '${uid}' logged out gracefully. Setting status to offline.`);
        return userStatusRef.set({
            isOnline: false,
            lastSeen: new Date().toISOString()
        }, { merge: true });
    }

    return null; // Ignore any other states.
});
// =====================================================================
// ============= END: USER PRESENCE SYSTEM (REALTIME DB) ===============
// =====================================================================

// =========== START: GHOST CLEANUP FUNCTION ===========
exports.cleanupGhostArtifacts = onCall(async (request) => {
    // Security Check: Only an admin can run this destructive operation.
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
      throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }

    const uid = request.auth.uid;
    logger.info(`Admin '${uid}' initiated ghost artifact cleanup.`);
    const db = admin.firestore();
    const stableAppId = "production-app-id";

    try {
        const artifactsRef = db.collection("artifacts");
        const allArtifactDocs = await artifactsRef.get();
        
        const ghostsToDelete = [];
        allArtifactDocs.forEach(doc => {
            if (doc.id !== stableAppId) {
                ghostsToDelete.push(doc.ref);
            }
        });

        if (ghostsToDelete.length === 0) {
            logger.info("No ghost artifacts found. Database is clean.");
            return { success: true, message: "Scan complete. No ghost artifacts found!" };
        }

        logger.info(`Found ${ghostsToDelete.length} ghost artifact documents to delete.`);

        const batch = db.batch();
        ghostsToDelete.forEach(ref => {
            batch.delete(ref);
        });
        
        await batch.commit();

        const successMessage = `Cleanup successful! Permanently deleted ${ghostsToDelete.length} ghost artifact documents.`;
        logger.info(successMessage);
        return { success: true, message: successMessage };

    } catch (error) {
        logger.error("Error during ghost artifact cleanup:", error);
        throw new HttpsError("internal", "An error occurred during the cleanup process.", error.message);
    }
});
// =========== END: GHOST CLEANUP FUNCTION ===========

    // =========== START: CORRECTED 'searchForUser' FUNCTION (HYBRID LOGIC) ===========
exports.searchForUser = onCall(async (request) => {
    if (!request.auth.uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to search for users.");
    }

    const { searchTerm } = request.data;
    if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length < 3) {
        return { users: [] };
    }

    const db = admin.firestore();
    const creatorsRef = db.collection("creators");
    const searchStr = searchTerm.trim().toLowerCase();
    
    try {
        // Step 1: Fetch all users from the database.
        // This mirrors the logic from the working DiscoverUsersScreen.
        const snapshot = await creatorsRef.get();
        
        logger.info(`[Hybrid Search] Fetched ${snapshot.size} total users to filter in memory.`);

        if (snapshot.empty) {
            return { users: [] };
        }

        // Step 2: Filter the results in the function's memory using .includes().
        const users = snapshot.docs
            .map(doc => ({ userId: doc.id, ...doc.data() }))
            .filter(user => 
                user.creatorName && 
                user.creatorName.toLowerCase().includes(searchStr)
            )
            .slice(0, 10) // Limit the number of results returned.
            .map(user => ({ // Return only public-safe data.
                userId: user.userId,
                creatorName: user.creatorName,
                profilePictureUrl: user.profilePictureUrl || ""
            }));

        logger.info(`[Hybrid Search] Found ${users.length} matches for "${searchStr}".`);
        return { users: users };

    } catch (error) {
        logger.error("Error during hybrid user search:", error);
        throw new HttpsError("internal", "An error occurred while searching for users.", error.message);
    }
});
// =========== END: CORRECTED 'searchForUser' FUNCTION (HYBRID LOGIC) ===========

exports.approvePledge = onCall(async (request) => {
  const uid = request.auth.uid;
  if (!uid) { throw new HttpsError("unauthenticated", "You must be logged in to perform this action."); }

  if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
    throw new HttpsError("permission-denied", "You must be an admin to approve pledges.");
  }
  
  const { pledgeId, appId } = request.data;
  if (!pledgeId || !appId) {
    throw new HttpsError("invalid-argument", "The function must be called with 'pledgeId' and 'appId'.");
  }

  logger.info(`Admin '${uid}' initiated approval for pledge '${pledgeId}'.`);
  const db = admin.firestore();
  
  try {
    let finalPledgeData = null;

    await db.runTransaction(async (transaction) => {
      const pledgeRef = db.collection("paymentPledges").doc(pledgeId);
      const pledgeDoc = await transaction.get(pledgeRef);

      if (!pledgeDoc.exists) { throw new HttpsError("not-found", `Pledge with ID '${pledgeId}' does not exist.`); }
      if (pledgeDoc.data().status !== "pending") { throw new HttpsError("failed-precondition", `Pledge is not in 'pending' state.`); }

      const pledgeData = pledgeDoc.data();
      finalPledgeData = pledgeData; // Store for notification block
      const userRef = db.collection("creators").doc(pledgeData.userId);
      const approvalTimestamp = new Date();
      
      // --- NVA CENTERSTAGE GIFT TOKEN ENGINE ---
      if (pledgeData.paymentType === 'giftToken') {
        const recipientId = pledgeData.targetUserId;
        
        // Prevent self-gifting to protect transactional integrity and abuse
        if (pledgeData.userId === recipientId) {
            throw new HttpsError("failed-precondition", "Users cannot send gifts to themselves.");
        }
        
        const grossAmount = pledgeData.amount;
        const netAmount = Math.round((grossAmount * (1 - PLATFORM_FEE_PERCENTAGE)) * 100) / 100;
        
        const recipientRef = db.collection("creators").doc(recipientId);
        const buyerRef = db.collection("creators").doc(pledgeData.userId);
        
        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        const twentyFourHoursFromNow = new Date(now.getTime() + (24 * 60 * 60 * 1000));

        // 1. ALL TRANSACTION READS FIRST (Strictly enforced)
        const [recipientDoc, buyerDoc] = await Promise.all([
            transaction.get(recipientRef),
            transaction.get(buyerRef)
        ]);
        
        if (!recipientDoc.exists) { throw new HttpsError("not-found", "Actor profile not found."); }
        if (!buyerDoc.exists) { throw new HttpsError("not-found", "Buyer profile not found."); }

        let compDoc = null;
        if (pledgeData.paymentType === 'competitionEntry') {
            const compRef = db.collection("competitions").doc(pledgeData.competitionId);
            compDoc = await transaction.get(compRef);
            if (!compDoc.exists) { throw new HttpsError("not-found", "Competition not found."); }
        }

        const recipientData = recipientDoc.data();
        const activeTeamTag = recipientData.teamTag;
        const isTeamGift = !!activeTeamTag;

        let teamSnapshot = null;
        if (isTeamGift) {
            const teamQuery = db.collection("creators").where("isContestant", "==", true).where("teamTag", "==", activeTeamTag);
            teamSnapshot = await transaction.get(teamQuery);
        }

        // 2. TRANSACTION CALCULATIONS SECOND
        const buyerData = buyerDoc.data();
        const currentLifetimeSpent = buyerData.lifetimeSpent || 0;
        const newLifetimeSpent = currentLifetimeSpent + grossAmount;
        let patronBadge = null;
        
        if (newLifetimeSpent >= 50000) patronBadge = 'Patron of the Arts (Legend)';
        else if (newLifetimeSpent >= 15000) patronBadge = 'Patron of the Arts (Gold)';
        else if (newLifetimeSpent >= 5000) patronBadge = 'Patron of the Arts (Silver)';
        else if (newLifetimeSpent >= 1000) patronBadge = 'Patron of the Arts (Bronze)';

        const buyerBadges = buyerData.badges || [];
        const cleanBadges = buyerBadges.filter(b => !b.startsWith('Patron of the Arts'));
        if (patronBadge) cleanBadges.push(patronBadge);

        const giftFieldPath = `giftInventory.${pledgeData.giftName}`;

        // 3. ALL TRANSACTION WRITES LAST
        transaction.update(pledgeRef, { status: "approved", approvedAt: approvalTimestamp.toISOString(), approvedBy: uid });

        transaction.update(buyerRef, {
            patronStripeExpiry: thirtyDaysFromNow.toISOString(),
            lifetimeSpent: newLifetimeSpent,
            badges: cleanBadges
        });

        if (isTeamGift && teamSnapshot) {
            const memberCount = teamSnapshot.size > 0 ? teamSnapshot.size : 1;
            const splitEarnings = netAmount / memberCount;

            teamSnapshot.forEach(memberDoc => {
                const updates = {
                    giftsReceived: FieldValue.increment(1),
                    [giftFieldPath]: FieldValue.increment(1),
                    receivedGifts: FieldValue.arrayUnion({
                        id: pledgeId,
                        giftName: pledgeData.giftName,
                        expiresAt: thirtyDaysFromNow.toISOString()
                    })
                };
                
                if (pledgeData.isFilmmakerDonation) {
                    updates["boxOfficeLedger.filmDonations"] = FieldValue.increment(splitEarnings);
                } else {
                    updates.totalEarnings = FieldValue.increment(splitEarnings);
                }
                transaction.update(memberDoc.ref, updates);
            });
        } else {
            const updates = {
                giftsReceived: FieldValue.increment(1),
                supportedTokenExpiry: twentyFourHoursFromNow.toISOString(),
                [giftFieldPath]: FieldValue.increment(1),
                receivedGifts: FieldValue.arrayUnion({
                    id: pledgeId,
                    giftName: pledgeData.giftName,
                    expiresAt: thirtyDaysFromNow.toISOString()
                })
            };

            if (pledgeData.isFilmmakerDonation) {
                updates["boxOfficeLedger.filmDonations"] = FieldValue.increment(netAmount);
            } else {
                updates.totalEarnings = FieldValue.increment(netAmount);
            }
            transaction.update(recipientRef, updates);
        }

        if (pledgeData.competitionId && pledgeData.entryId) {
            const entryRef = db.doc(`competitions/${pledgeData.competitionId}/entries/${pledgeData.entryId}`);
            const entryGiftFieldPath = `giftInventory.${pledgeData.giftName}`;
            transaction.update(entryRef, {
                giftsReceived: FieldValue.increment(1),
                [entryGiftFieldPath]: FieldValue.increment(1)
            });
        }
        
        if (!pledgeData.isAnonymous) {
            const supporterRef = recipientRef.collection("supporters").doc(pledgeData.userId);
            transaction.set(supporterRef, {
                userName: pledgeData.userName || "A fan",
                amountGiven: FieldValue.increment(grossAmount),
                lastGift: approvalTimestamp.toISOString()
            }, { merge: true });
            
            const broadcastNotification = {
                broadcastType: "GIFT_RECEIVED", 
                message: `🎉 ${pledgeData.userName || 'A fan'} sent a [${pledgeData.giftName}] to ${recipientDoc.data().creatorName}!`,
                link: `/user/${recipientId}`, 
                timestamp: approvalTimestamp
            };
            transaction.set(db.collection("broadcast_notifications").doc(), broadcastNotification);
        }
      } 
      else if (pledgeData.paymentType === 'competitionEntry') {
        const compId = pledgeData.competitionId;
        const entryId = pledgeData.entryId || pledgeData.userId; 
        const grossAmount = pledgeData.amount;
        const netAmount = Math.round((grossAmount * (1 - PLATFORM_FEE_PERCENTAGE)) * 100) / 100;

        const compRef = db.collection("competitions").doc(compId);
        const entryRef = compRef.collection("entries").doc(entryId);

        const compDoc = await transaction.get(compRef);
        if (!compDoc.exists) { throw new HttpsError("not-found", "Competition not found."); }

        const currentPrizePool = compDoc.data().prizePool || 0;
        const newPrizePool = currentPrizePool + netAmount;

        transaction.update(compRef, { prizePool: newPrizePool });
        transaction.update(entryRef, {
            status: 'active',
            approvedAt: approvalTimestamp.toISOString(),
            createdAt: FieldValue.serverTimestamp()
        });

        transaction.update(pledgeRef, { status: "approved", approvedAt: approvalTimestamp.toISOString(), approvedBy: uid });
      } 
      else if (pledgeData.paymentType === 'roastTokens') {
        const buyerRef = db.collection("creators").doc(pledgeData.userId);
        const tokensToAward = pledgeData.tokenAmount || 0;
        
        const cashValueToAdd = Math.round((pledgeData.amount * 0.85) * 100) / 100;

        transaction.update(pledgeRef, { status: "approved", approvedAt: approvalTimestamp.toISOString(), approvedBy: uid });
        transaction.update(buyerRef, {
            roastTokens: FieldValue.increment(tokensToAward),
            tokenCashValue: FieldValue.increment(cashValueToAdd),
            lifetimeSpent: FieldValue.increment(pledgeData.amount)
        });
      }
      else if (pledgeData.paymentType === 'eventTicket') {
        const eventId = pledgeData.targetEventId; 
        const ticketPrice = pledgeData.amount;
        
        const finalRecipientId = pledgeData.recipientId || pledgeData.userId; 
        const ticketBuyerRef = db.collection("creators").doc(finalRecipientId);
        
        const [eventDoc, movieDoc, ticketBuyerDoc] = await Promise.all([
            eventId ? transaction.get(db.collection("events").doc(eventId)) : Promise.resolve(null),
            eventId ? transaction.get(db.collection("movies").doc(eventId)) : Promise.resolve(null),
            transaction.get(ticketBuyerRef)
        ]);
        
        if (!ticketBuyerDoc.exists) { throw new HttpsError("not-found", "Ticket recipient does not exist."); }
        
        transaction.update(pledgeRef, { status: "approved", approvedAt: approvalTimestamp.toISOString(), approvedBy: uid });  
        
        if (eventId) {
            transaction.set(ticketBuyerRef, { purchasedTickets: { [eventId]: true } }, { merge: true });
            
            if (eventDoc && eventDoc.exists) {
                transaction.update(eventDoc.ref, {
                    ticketsSold: FieldValue.increment(1),
                    totalRevenue: FieldValue.increment(ticketPrice)
                });
            }

            if (movieDoc && movieDoc.exists) {
                const movieData = movieDoc.data();
                if (movieData.creatorId) {
                    const filmmakerRef = db.collection("creators").doc(movieData.creatorId);
                    const filmmakerNet = Math.round((ticketPrice * 0.85) * 100) / 100;
                    transaction.set(filmmakerRef, {
                        boxOfficeLedger: {
                            ticketSales: FieldValue.increment(filmmakerNet)
                        }
                    }, { merge: true });
                }
            }
        }
      } else {
        transaction.update(pledgeRef, { status: "approved", approvedAt: approvalTimestamp.toISOString(), approvedBy: uid });
      }
    });

    logger.info(`Pledge '${pledgeId}' approved successfully.`);

    const notificationsRef = db.collection("notifications");
    const createNotification = async (payload) => {
        await notificationsRef.add({
            ...payload,
            isRead: false,
            status: "pending",
            timestamp: FieldValue.serverTimestamp()
        });
        const userRef = db.collection("creators").doc(payload.userId);
        await userRef.update({ unreadNotificationCount: FieldValue.increment(1) });
    };

    if (finalPledgeData.paymentType === 'competitionEntry') {
        const targetReceiverId = finalPledgeData.entryId || finalPledgeData.userId;
        await createNotification({
            userId: targetReceiverId, 
            title: "Audition Approved! 🏆",
            body: `Your entry "${finalPledgeData.entryTitle || 'Contestant Entry'}" was approved and is now live in the tournament!`,
            link: "/CompetitionScreen",
            deliveryType: ["inbox", "push"],
            notificationType: "ENTRY_APPROVED",
            sound: true
        });
    } else if (finalPledgeData.paymentType === 'giftToken') {
        const isShowcaseDonation = !finalPledgeData.competitionId;
        const notifTitle = isShowcaseDonation ? "New Film Donation! 🎁" : "You Received a Gift!";
        const notifBody = isShowcaseDonation 
            ? (finalPledgeData.isAnonymous ? `An anonymous fan sent you a donation of ${finalPledgeData.amount.toLocaleString()} GYD for your Showcase film!` : `${finalPledgeData.userName} sent you a donation of ${finalPledgeData.amount.toLocaleString()} GYD for your Showcase film!`)
            : (finalPledgeData.isAnonymous ? `An anonymous fan sent you a ${finalPledgeData.giftName}!` : `${finalPledgeData.userName} sent you a ${finalPledgeData.giftName}!`);

        await createNotification({
            userId: finalPledgeData.targetUserId,
            title: notifTitle,
            body: notifBody,
            link: "/CreatorDashboard",
            deliveryType: ["inbox", "push"],
            notificationType: "GIFT_RECEIVED",
            sound: true
        });
        await createNotification({
            userId: finalPledgeData.userId,
            title: "Gift Delivered",
            body: `Your ${finalPledgeData.giftName} was successfully delivered!`,
            link: "/Home",
            deliveryType: ["inbox"],
            notificationType: "Pledge Approved",
            sound: false
        });
    } else if (finalPledgeData.paymentType === 'eventTicket') {
        const isGift = !!finalPledgeData.recipientId;
        const filmName = finalPledgeData.targetEventTitle || "the Premiere";
        const senderName = finalPledgeData.userName || "A friend";
        const recipientName = finalPledgeData.recipientName || "your friend";

        if (isGift) {
            await createNotification({
                userId: finalPledgeData.recipientId,
                title: "Gift Ticket Received! 🎟️",
                body: `${senderName} gifted you a ticket for ${filmName}`,
                link: "/Discover",
                deliveryType: ["inbox", "push"],
                notificationType: "TICKET_GIFTED",
                sound: true
            });
            await createNotification({
                userId: finalPledgeData.userId,
                title: "Ticket Delivered",
                body: `Your gift ticket to ${recipientName} for ${filmName} has been delivered successfully.`,
                link: "/Discover",
                deliveryType: ["inbox"],
                notificationType: "TICKET_DELIVERED",
                sound: false
            });
        } else {
            await createNotification({
                userId: finalPledgeData.userId,
                title: "Ticket Purchase Confirmed! 🎟️",
                body: `Your ticket for ${filmName} is confirmed!`,
                link: "/Discover",
                deliveryType: ["inbox", "push"],
                notificationType: "TICKET_PURCHASED",
                sound: true
            });
        }
    }
    
    return { message: "Pledge approved and notifications sent." };
  } catch (error) {
    logger.error("Error approving pledge", { error });
    if (error instanceof HttpsError) { throw error; }
    throw new HttpsError("unknown", error.message);
  }
});

    // --- GHOST BADGE REPAIR UTILITY (ADMIN TOOL) ---
exports.recalculateUnreadNotifications = onCall(async (request) => {
    // Security Check: Only an admin can run this function.
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }

    const { targetUserId } = request.data;
    if (!targetUserId) {
        throw new HttpsError("invalid-argument", "The function must be called with a 'targetUserId'.");
    }

    const db = admin.firestore();
    const userRef = db.collection("creators").doc(targetUserId);
    const notificationsRef = db.collection("notifications");

    try {
        // 1. Query for the target user's actual unread notifications using correct Admin SDK syntax.
        const unreadQuery = notificationsRef
            .where("userId", "==", targetUserId)
            .where("isRead", "==", false);
        
        const snapshot = await unreadQuery.get(); // Correct Admin SDK method

        // 2. The real count is the number of documents found.
        const correctCount = snapshot.size;

        // 3. Overwrite the incorrect value on the target user's profile.
        await userRef.update({ unreadNotificationCount: correctCount });

        logger.info(`Admin '${request.auth.uid}' recalibrated notification count for user '${targetUserId}' to ${correctCount}.`);
        return { success: true, message: `Badge count for user ${targetUserId} has been corrected to ${correctCount}.` };

    } catch (error) {
        logger.error(`Error recalculating notifications for user ${targetUserId}`, { error });
        throw new HttpsError("internal", "An error occurred during recalculation.");
    }
});

// =====================================================================
// =========== FINAL, PRODUCTION DATA INTEGRITY AUDIT TOOL =============
// =====================================================================
exports.runDataIntegrityAudit = onCall({timeoutSeconds: 540}, async (request) => {
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
        throw new HttpsError("permission-denied", "You must be an admin to run the data audit.");
    }

    const uid = request.auth.uid;
    logger.info(`Admin '${uid}' initiated a partial data integrity audit.`);
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const summary = {
        orphanedDocumentsDeleted: 0,
        orphanedStorageFilesDeleted: 0,
        // Follower counts are no longer processed by this function
    };

    try {
        const creatorsSnapshot = await db.collection("creators").get();
        const validUserIds = new Set(creatorsSnapshot.docs.map(doc => doc.id));
        logger.info(`Audit Step 1: Found ${validUserIds.size} valid user documents.`);

        // Step 2: Clean up ALL orphaned documents from various collections
        const collectionsToAudit = {
            'content_items': { field: 'creatorId', check: 'field' },
            'campaigns': { field: 'creatorId', check: 'field' },
            'opportunities': { field: 'postedByUid', check: 'field' },
            'promotedStatuses': { field: 'postedByUid', check: 'field' },
            'paymentPledges': { field: 'userId', check: 'field' },
            'reports': { field: 'reporterId', check: 'field' },
            'comments': { field: 'userId', check: 'field' },
            'likes': { field: null, check: 'document_id' }
        };

        for (const [col, auditRule] of Object.entries(collectionsToAudit)) {
            const q = db.collectionGroup(col);
            const snapshot = await q.get();
            if (snapshot.empty) continue;

            let batch = db.batch();
            let writeCount = 0;

            for (const doc of snapshot.docs) {
                let idToCheck = null;
                if (auditRule.check === 'document_id') {
                    idToCheck = doc.id;
                } else {
                    idToCheck = doc.data()[auditRule.field];
                }

                if (idToCheck && !validUserIds.has(idToCheck)) {
                    summary.orphanedDocumentsDeleted++;
                    batch.delete(doc.ref);
                    writeCount++;
                    if (writeCount >= 499) {
                        await batch.commit();
                        batch = db.batch();
                        writeCount = 0;
                    }
                }
            }
            if (writeCount > 0) await batch.commit();
            logger.info(`Audit Step 2: Cleaned up collection group '${col}'.`);
        }

        // Step 3: Clean up orphaned Storage files
        const storagePrefixes = ['profile_pictures', 'content_thumbnails', 'campaign_thumbnails', 'opportunity_flyers', 'promo_flyers', 'creator_uploads', 'competition_entries'];
        let orphanedFilesDeleted = 0;

        for (const prefix of storagePrefixes) {
            const [files] = await bucket.getFiles({ prefix: `${prefix}/` });
            if (files.length === 0) continue;

            const filesToDelete = [];
            files.forEach(file => {
                const pathParts = file.name.split('/');
                let userIdInPath = null;

                if (pathParts.length > 1) {
                    const potentialUserId = pathParts[1];
                    if (validUserIds.has(potentialUserId)) { return; }
                    userIdInPath = potentialUserId;
                }

                if (!userIdInPath) {
                    const filename = pathParts[pathParts.length - 1];
                    const userIdMatch = filename.split('_')[0];
                    if (validUserIds.has(userIdMatch)) { return; }
                    userIdInPath = userIdMatch;
                }
                
                if (userIdInPath && !validUserIds.has(userIdInPath)) {
                    filesToDelete.push(file);
                }
            });

            if (filesToDelete.length > 0) {
                logger.info(`Audit Step 3: Found ${filesToDelete.length} orphaned file(s) in prefix '${prefix}'. Deleting...`);
                for (const file of filesToDelete) {
                    try {
                        await file.delete();
                        orphanedFilesDeleted++;
                    } catch (error) {
                        logger.error(`Failed to delete orphaned file: ${file.name}`, { error: error.message });
                    }
                }
            }
        }
        summary.orphanedStorageFilesDeleted = orphanedFilesDeleted;
        logger.info(`Audit Step 3: Completed storage cleanup. Deleted ${orphanedFilesDeleted} orphaned files.`);
        
        logger.info("Data integrity audit completed successfully.", summary);
        return { success: true, summary: summary };

    } catch (error) {
        logger.error("Error during data integrity audit:", error);
        throw new HttpsError("internal", "An error occurred during the audit process.", error.message);
    }
});

    // =====================================================================
// =========== ONE-TIME DATA REPAIR AND RECALIBRATION TOOL =============
// =====================================================================
exports.recalibrateAllCounts = onCall(async (request) => {
    // Security Check: Only an admin can run this destructive/reparative operation.
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
        throw new HttpsError("permission-denied", "You must be an admin to run this function.");
    }

    const uid = request.auth.uid;
    logger.info(`Admin '${uid}' initiated a full recalibration of all content interaction counts.`);
    const db = admin.firestore();
    const appId = "production-app-id";

    const summary = {
        contentItemsScanned: 0,
        likeCountsCorrected: 0,
        commentCountsCorrected: 0,
        ghostLikesRemoved: 0,
        ghostCommentsRemoved: 0, // In case any exist
    };

    try {
        // Step 1: Get all valid user IDs for efficient checking.
        const creatorsSnapshot = await db.collection("creators").get();
        const validUserIds = new Set(creatorsSnapshot.docs.map(doc => doc.id));
        logger.info(`Recalibration Step 1: Found ${validUserIds.size} valid user documents.`);

        // Step 2: Get all content items to process.
        const contentSnapshot = await db.collection(`artifacts/${appId}/public/data/content_items`).get();
        if (contentSnapshot.empty) {
            return { success: true, message: "No content items found to process.", summary };
        }
        logger.info(`Recalibration Step 2: Found ${contentSnapshot.size} content items to scan.`);

        // Step 3: Iterate through each content item and verify/recount its subcollections.
        for (const contentDoc of contentSnapshot.docs) {
            summary.contentItemsScanned++;
            const contentRef = contentDoc.ref;
            const contentData = contentDoc.data();
            let needsUpdate = false;
            const updates = {};

            // --- Recalibrate Comments ---
            const commentsRef = contentRef.collection("comments");
            const commentsSnapshot = await commentsRef.get();
            let actualCommentCount = 0;
            if (!commentsSnapshot.empty) {
                let batch = db.batch();
                let writeCount = 0;
                for (const commentDoc of commentsSnapshot.docs) {
                    const commentData = commentDoc.data();
                    // THE FIX: Check for essential data fields (text/userName) in addition to a valid user.
                    if (validUserIds.has(commentData.userId) && commentData.text != null && commentData.userName != null) {
                        actualCommentCount++;
                    } else {
                        // This is a ghost or corrupt comment. Delete it.
                        batch.delete(commentDoc.ref);
                        summary.ghostCommentsRemoved++;
                        writeCount++;
                        // Commit the batch if it's full to avoid exceeding limits
                        if (writeCount >= 499) {
                            await batch.commit();
                            batch = db.batch();
                            writeCount = 0;
                        }
                    }
                }
                // Commit any remaining writes in the last batch
                if (writeCount > 0) {
                    await batch.commit();
                }
            }

            // If the actual count is different from the stored count (including negative numbers), update it.
            if (contentData.commentCount !== actualCommentCount) {
                updates.commentCount = actualCommentCount;
                summary.commentCountsCorrected++;
                needsUpdate = true;
            }

            // --- Recalibrate Likes ---
            const likesRef = contentRef.collection("likes");
            const likesSnapshot = await likesRef.get();
            let actualLikeCount = 0;
            if (!likesSnapshot.empty) {
                const batch = db.batch();
                likesSnapshot.forEach(likeDoc => {
                    // Likes use the document ID as the userId.
                    if (validUserIds.has(likeDoc.id)) {
                        actualLikeCount++;
                    } else {
                        // This is a ghost like from a deleted user.
                        batch.delete(likeDoc.ref);
                        summary.ghostLikesRemoved++;
                    }
                });
                await batch.commit();
            }

            // If the actual count is different, update it.
            if (contentData.likeCount !== actualLikeCount) {
                updates.likeCount = actualLikeCount;
                summary.likeCountsCorrected++;
                needsUpdate = true;
            }

            // If any corrections are needed for this content item, apply them.
            if (needsUpdate) {
                await contentRef.update(updates);
            }
        }

        logger.info("Full interaction count recalibration completed successfully.", summary);
        return { success: true, message: "Recalibration process finished.", summary };

    } catch (error) {
        logger.error("Error during interaction count recalibration:", error);
        throw new HttpsError("internal", "An error occurred during the recalibration process.", error.message);
    }
});

    // =========== END: ONE-TIME DATA REPAIR AND RECALIBRATION TOOL =============
// =====================================================================

  exports.cleanupDuplicateFCMTokens = onCall(async (request) => {
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
        throw new HttpsError("permission-denied", "You must be an admin to run this task.");
    }
    logger.info(`Admin '${request.auth.uid}' initiated a cleanup of duplicate FCM tokens.`);
    const db = admin.firestore();
    let usersProcessed = 0;
    let usersCleaned = 0;

    try {
        const creatorsSnapshot = await db.collection("creators").get();
        const batch = db.batch();

        creatorsSnapshot.forEach(doc => {
            usersProcessed++;
            const data = doc.data();
            const tokens = data.fcmTokens;

            if (Array.isArray(tokens) && tokens.length > 0) {
                const uniqueTokens = [...new Set(tokens)];
                if (tokens.length !== uniqueTokens.length) {
                    usersCleaned++;
                    batch.update(doc.ref, { fcmTokens: uniqueTokens });
                }
            }
        });

        await batch.commit();

        const message = `Cleanup complete. Processed ${usersProcessed} users. Found and removed duplicate tokens from ${usersCleaned} users.`;
        logger.info(message);
        return { success: true, message: message };

    } catch (error) {
        logger.error("Error during FCM token cleanup:", error);
        throw new HttpsError("internal", "An error occurred during the cleanup process.");
    }
});

 exports.addContentToLibrary = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to add content.");
    }
    const { contentData, appId } = request.data;
    if (!contentData || !appId) {
        throw new HttpsError("invalid-argument", "Missing content data or appId.");
    }

    const db = admin.firestore();
    const contentRef = db.collection(`artifacts/${appId}/public/data/content_items`);

    const userContentQuery = contentRef.where("creatorId", "==", uid);
    const userContentSnapshot = await userContentQuery.get();

    if (userContentSnapshot.size >= 100) {
        throw new HttpsError("resource-exhausted", "You have reached the maximum limit of 100 videos in your library.");
    }

    const isMonetizationRequest = contentData.isMonetizationRequest === true;

    const finalData = {
        ...contentData,
        creatorId: uid,
        createdAt: new Date().toISOString(),
        viewCount: 0,
        likeCount: 0,
        isFeatured: false, // Reverted: Must be manually featured by the creator
        isActive: contentData.isActive !== undefined ? contentData.isActive : true,
    };

    try {
        const newDoc = await contentRef.add(finalData);

        logger.info(`User '${uid}' successfully added new content titled "${finalData.title}".`);
        return { success: true, message: "Content added to your library successfully." };
    } catch (error) {
        logger.error("Error adding content to library:", error);
        throw new HttpsError("internal", "An unexpected error occurred while saving your content.");
    }
});

exports.togglePinStatus = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to pin content.");
    }
    const { contentId } = request.data;
    if (!contentId) {
        throw new HttpsError("invalid-argument", "Missing contentId.");
    }

    const db = admin.firestore();
    const creatorRef = db.collection("creators").doc(uid);

    try {
        const creatorDoc = await creatorRef.get();
        if (!creatorDoc.exists) {
            throw new HttpsError("not-found", "Your creator profile could not be found.");
        }

        const pinnedContent = creatorDoc.data().pinnedContent || [];
        const isCurrentlyPinned = pinnedContent.includes(contentId);

        if (isCurrentlyPinned) {
            await creatorRef.update({
                pinnedContent: admin.firestore.FieldValue.arrayRemove(contentId)
            });
            return { success: true, message: "Content unpinned successfully." };
        } else {
            if (pinnedContent.length >= 3) {
                throw new HttpsError("resource-exhausted", "You can only pin a maximum of 3 videos. Please unpin another video first.");
            }
            await creatorRef.update({
                pinnedContent: admin.firestore.FieldValue.arrayUnion(contentId)
            });
            return { success: true, message: "Content pinned to your profile!" };
        }
    } catch (error) {
        logger.error(`Error toggling pin status for user '${uid}'`, { error });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred.");
    }
});

    exports.clearPinnedContent = onCall(async (request) => {
    // Security Check: Only an admin can run this operation.
    if (request.auth.token.admin !== true) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }

    const { targetUserId } = request.data;
    if (!targetUserId) {
        throw new HttpsError("invalid-argument", "The function must be called with a 'targetUserId'.");
    }

    const db = admin.firestore();
    const creatorRef = db.collection("creators").doc(targetUserId);

    try {
        const creatorDoc = await creatorRef.get();
        if (!creatorDoc.exists) {
            throw new HttpsError("not-found", "The specified user profile could not be found.");
        }

        // This is the core fix: it forcefully resets the pinnedContent array to be empty.
        await creatorRef.update({
            pinnedContent: []
        });

        logger.info(`Admin '${request.auth.uid}' successfully cleared pinned content for user '${targetUserId}'.`);
        return { success: true, message: `Pinned content for user ${targetUserId} has been cleared.` };

    } catch (error) {
        logger.error(`Error clearing pinned content for user '${targetUserId}':`, { error });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred during the cleanup process.");
    }
});

exports.deleteContentItem = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to delete content.");
    }
    const { contentId, appId } = request.data;
    if (!contentId || !appId) {
        throw new HttpsError("invalid-argument", "Missing contentId or appId.");
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const contentRef = db.collection(`artifacts/${appId}/public/data/content_items`).doc(contentId);

    try {
        const contentDoc = await contentRef.get();
        if (!contentDoc.exists) {
            logger.warn(`User '${uid}' tried to delete non-existent content '${contentId}'.`);
            return { success: true, message: "Content already deleted." };
        }
        const contentData = contentDoc.data();

        if (contentData.creatorId !== uid && request.auth.token.admin !== true) {
            throw new HttpsError("permission-denied", "You do not have permission to delete this content.");
        }

        if (contentData.customThumbnailUrl && contentData.customThumbnailUrl.includes('firebasestorage')) {
            try {
                const url = new URL(contentData.customThumbnailUrl);
                const path = decodeURIComponent(url.pathname.split('/o/')[1]);
                await bucket.file(path).delete();
                logger.info(`Deleted thumbnail for '${contentId}' from Storage.`);
            } catch (e) {
                logger.warn(`Could not delete thumbnail for '${contentId}'.`, e.message);
            }
        }
        
        const creatorRef = db.collection("creators").doc(contentData.creatorId);

        const creatorDoc = await creatorRef.get();
        const updates = { pinnedContent: admin.firestore.FieldValue.arrayRemove(contentId) };
        
        // Wipe from Showcase if this was the featured video
        if (creatorDoc.data()?.featuredVideoLink?.liveFeedContentId === contentId) {
            updates.featuredVideoLink = admin.firestore.FieldValue.delete();
        }

        await creatorRef.update(updates);
        
        const followersSnapshot = await creatorRef.collection("followers").get();
        if (!followersSnapshot.empty) {
            const batch = db.batch();
            followersSnapshot.forEach(followerDoc => {
                const feedItemRef = db.collection("creators").doc(followerDoc.id).collection("feed").doc(contentId);
                batch.delete(feedItemRef);
            });
            await batch.commit();
            logger.info(`Removed '${contentId}' from ${followersSnapshot.size} follower feeds.`);
        }

        // Secure Cascade Fix: Erase all nested comments and likes subcollections to prevent zombie db drift [1]
        await deleteCollection(db, contentRef.collection("comments"), 400);
        await deleteCollection(db, contentRef.collection("likes"), 400);

        await contentRef.delete();
        logger.info(`User '${uid}' successfully deleted content item '${contentId}'.`);
        
        return { success: true, message: "Content and all associated data have been deleted." };
    } catch (error) {
        logger.error(`Error deleting content '${contentId}' for user '${uid}'`, { error });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred during deletion.");
    }
});

        exports.updateContentDetails = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to update content.");
    }

    const { contentId, appId, updates } = request.data;
    if (!contentId || !appId || !updates) {
        throw new HttpsError("invalid-argument", "Missing contentId, appId, or update data.");
    }

    const db = admin.firestore();
    const contentRef = db.collection(`artifacts/${appId}/public/data/content_items`).doc(contentId);
    const creatorRef = db.collection("creators").doc(uid); // Reference to the user's own profile

    try {
        await db.runTransaction(async (transaction) => {
            const [contentDoc, creatorDoc] = await Promise.all([
                transaction.get(contentRef),
                transaction.get(creatorRef)
            ]);

            if (!contentDoc.exists) {
                throw new HttpsError("not-found", "The content you are trying to edit does not exist.");
            }
            if (!creatorDoc.exists) {
                throw new HttpsError("not-found", "Your creator profile could not be found.");
            }

            const contentData = contentDoc.data();
            if (contentData.creatorId !== uid) {
                throw new HttpsError("permission-denied", "You do not have permission to edit this content.");
            }

            const allowedUpdates = {};
            if (updates.title !== undefined) allowedUpdates.title = updates.title;
            if (updates.description !== undefined) allowedUpdates.description = updates.description;
            if (updates.customThumbnailUrl !== undefined) allowedUpdates.customThumbnailUrl = updates.customThumbnailUrl;
            
            // ALLOW MONETIZATION REQUESTS TO PASS THROUGH
            if (updates.monetizationStatus !== undefined) allowedUpdates.monetizationStatus = updates.monetizationStatus;
            if (updates.isMonetizationRequest !== undefined) allowedUpdates.isMonetizationRequest = updates.isMonetizationRequest;

            if (Object.keys(allowedUpdates).length === 0) {
                return; // End transaction if no valid updates
            }

            // 1. Update the source of truth (the content item)
            transaction.update(contentRef, allowedUpdates);

            // 2. Check if this content is the featured item and synchronize the data
            const creatorData = creatorDoc.data();
            if (creatorData.featuredVideoLink?.liveFeedContentId === contentId) {
                const newFeaturedLink = { ...creatorData.featuredVideoLink, ...allowedUpdates };
                transaction.update(creatorRef, { featuredVideoLink: newFeaturedLink });
            }
        });

        logger.info(`User '${uid}' successfully updated details for content '${contentId}'.`);
        return { success: true, message: "Content details updated successfully." };

    } catch (error) {
        logger.error(`Error updating content '${contentId}' for user '${uid}'`, { error });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while updating the content.");
    }
});

        exports.setFeaturedContent = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to feature content.");
    }
    const { contentId, appId } = request.data;
    if (!contentId || !appId) {
        throw new HttpsError("invalid-argument", "Missing contentId or appId.");
    }

    logger.info(`User '${uid}' is setting content '${contentId}' as featured.`);
    const db = admin.firestore();

    try {
        await db.runTransaction(async (transaction) => {
            const creatorRef = db.collection("creators").doc(uid);
            const contentToFeatureRef = db.collection(`artifacts/${appId}/public/data/content_items`).doc(contentId);

            const [creatorDoc, contentDoc] = await Promise.all([
                transaction.get(creatorRef),
                transaction.get(contentToFeatureRef)
            ]);

            if (!creatorDoc.exists || !contentDoc.exists) {
                throw new HttpsError("not-found", "Your profile or the selected content could not be found.");
            }
            if (contentDoc.data().creatorId !== uid) {
                throw new HttpsError("permission-denied", "You can only feature your own content.");
            }

            const creatorData = creatorDoc.data();
            const contentData = contentDoc.data();
            const oldFeaturedContentId = creatorData.featuredVideoLink?.liveFeedContentId;

            if (oldFeaturedContentId && oldFeaturedContentId !== contentId) {
                const oldContentRef = db.collection(`artifacts/${appId}/public/data/content_items`).doc(oldFeaturedContentId);
                const oldContentDoc = await transaction.get(oldContentRef);
                if(oldContentDoc.exists){
                   transaction.update(oldContentRef, { isFeatured: false });
                }
            }

            transaction.update(contentToFeatureRef, { isFeatured: true });

            // THE FIX: Provide a fallback for every field to prevent writing 'undefined'.
            const newFeaturedLink = {
                liveFeedContentId: contentId,
                title: contentData.title || '',
                customThumbnailUrl: contentData.customThumbnailUrl || '',
                embedUrl: contentData.embedUrl || '',
                mainUrl: contentData.mainUrl || ''
            };
            transaction.update(creatorRef, { featuredVideoLink: newFeaturedLink });
        });

        return { success: true, message: "Content is now featured on your profile." };

    } catch (error) {
        logger.error(`Error setting featured content for user '${uid}'`, { error });
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "An unexpected error occurred while featuring your item.");
    }
});

exports.promoteExternalLink = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid || (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin)) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }

    const { title, description, externalLink, imageUrl, appId } = request.data; // Added 'description'
    if (!title || !externalLink || !imageUrl || !appId) {
        throw new HttpsError("invalid-argument", "Missing required data.");
    }

    const db = admin.firestore();
    logger.info(`Moderator '${uid}' is promoting external link: "${title}"`);

    let embedUrl = externalLink;
    let videoPlatform = 'generic';

    if (externalLink.includes("youtube.com") || externalLink.includes("youtu.be")) {
        const videoIdMatch = externalLink.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?#]+)/);
        if (videoIdMatch && videoIdMatch[1]) {
            embedUrl = `https://www.youtube.com/embed/${videoIdMatch[1]}?autoplay=1&rel=0`;
            videoPlatform = 'youtube';
        }
    } else if (externalLink.includes("tiktok.com")) {
        const tiktokMatch = externalLink.match(/tiktok\.com\/.*\/video\/(\d+)/);
        if (tiktokMatch && tiktokMatch[1]) {
            embedUrl = `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}`;
            videoPlatform = 'tiktok';
        }
    }

    const newData = {
        title: title,
        description: description || '', // <-- THE FIX: Save the new description field
        mainUrl: externalLink,
        customThumbnailUrl: imageUrl,
        embedUrl: embedUrl,
        videoPlatform: videoPlatform,
        creatorId: uid,
        creatorName: "NVA Curated",
        contentType: "External Link",
        isCurated: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        viewCount: 0,
        likeCount: 0,
    };

    try {
        const newDocRef = await db.collection(`artifacts/${appId}/public/data/content_items`).add(newData);
        logger.info(`Successfully promoted link to new content item: ${newDocRef.id}`);
        const savedDoc = await newDocRef.get();
        const savedData = savedDoc.data();
        return { newItem: { id: newDocRef.id, ...savedData } };
    } catch (error) {
        logger.error("Error promoting external link:", error);
        throw new HttpsError("internal", "An unexpected error occurred.");
    }
});

exports.aggregateContentViewsAndLikes = onDocumentUpdated("artifacts/{appId}/public/data/content_items/{contentId}", (event) => {
    const dataBefore = event.data.before.data();
    const dataAfter = event.data.after.data();

    const creatorId = dataAfter.creatorId;
    if (!creatorId) {
        return null;
    }

    const viewCountChange = (dataAfter.viewCount || 0) - (dataBefore.viewCount || 0);
    const likeCountChange = (dataAfter.likeCount || 0) - (dataBefore.likeCount || 0);

    if (viewCountChange === 0 && likeCountChange === 0) {
        return null;
    }

    logger.info(`Aggregating stats for creator '${creatorId}'. Views: ${viewCountChange}, Likes: ${likeCountChange}`);

    const creatorRef = admin.firestore().collection("creators").doc(creatorId);
    const updates = {};
    if (viewCountChange > 0) {
        updates.dailyViews = admin.firestore.FieldValue.increment(viewCountChange);
        updates.weeklyViews = admin.firestore.FieldValue.increment(viewCountChange);
        updates.lifetimeViews = admin.firestore.FieldValue.increment(viewCountChange);
    }
    if (likeCountChange !== 0) {
        updates.dailyLikes = admin.firestore.FieldValue.increment(likeCountChange);
        updates.weeklyLikes = admin.firestore.FieldValue.increment(likeCountChange);
        updates.lifetimeLikes = admin.firestore.FieldValue.increment(likeCountChange);
    }

    return creatorRef.set(updates, { merge: true }).catch((error) => {
        logger.error(`Failed to aggregate stats for creator '${creatorId}'`, { error });
    });
});

        // =====================================================================
// =========== START: DATA SYNC FOR SEARCH FIELDS ======================
// =====================================================================

// Syncs the lowercase title when a new content_item is created.
exports.onContentItemCreateSyncLowerCase = onDocumentCreated("artifacts/{appId}/public/data/content_items/{contentId}", (event) => {
    const data = event.data.data();
    if (data.title && typeof data.title === 'string') {
        logger.info(`Syncing lowercase title for new content item '${event.params.contentId}'.`);
        return event.data.ref.set({
            title_lowercase: data.title.toLowerCase()
        }, { merge: true });
    }
    return null;
});

// Syncs the lowercase title when a content_item is updated.
exports.onContentItemUpdateSyncLowerCase = onDocumentUpdated("artifacts/{appId}/public/data/content_items/{contentId}", (event) => {
    const dataBefore = event.data.before.data();
    const dataAfter = event.data.after.data();

    // Only run if the title has actually changed and is a string.
    if (dataAfter.title && typeof dataAfter.title === 'string' && dataAfter.title !== dataBefore.title) {
        logger.info(`Syncing lowercase title for updated content item '${event.params.contentId}'.`);
        return event.data.after.ref.update({
            title_lowercase: dataAfter.title.toLowerCase()
        });
    }
    return null;
});

// Syncs the lowercase title when a new event is created.
exports.onEventCreateSyncLowerCase = onDocumentCreated("events/{eventId}", (event) => {
    const data = event.data.data();
    if (data.eventTitle && typeof data.eventTitle === 'string') {
        logger.info(`Syncing lowercase title for new event '${event.params.eventId}'.`);
        return event.data.ref.set({
            eventTitle_lowercase: data.eventTitle.toLowerCase()
        }, { merge: true });
    }
    return null;
});

// Syncs the lowercase title when an event is updated.
exports.onEventUpdateSyncLowerCase = onDocumentUpdated("events/{eventId}", (event) => {
    const dataBefore = event.data.before.data();
    const dataAfter = event.data.after.data();

    // Only run if the eventTitle has actually changed and is a string.
    if (dataAfter.eventTitle && typeof dataAfter.eventTitle === 'string' && dataAfter.eventTitle !== dataBefore.eventTitle) {
        logger.info(`Syncing lowercase title for updated event '${event.params.eventId}'.`);
        return event.data.after.ref.update({
            eventTitle_lowercase: dataAfter.eventTitle.toLowerCase()
        });
    }
    return null;
});

// =====================================================================
// ============ END: DATA SYNC FOR SEARCH FIELDS =======================
// =====================================================================

async function runTopPerformersUpdate() {
    const db = admin.firestore();
    const appId = "production-app-id";
    const settingsRef = db.collection("settings").doc("featuredContentSlots");

    const settingsDoc = await settingsRef.get();
    let slotsData = settingsDoc.exists ? settingsDoc.data() : {};
    
    // --- START: NEW SANITIZATION STEP ---
    const sanitizationUpdates = {};
    let wasSanitized = false;
    for (let i = 1; i <= 6; i++) {
        const slotKey = `slot_${i}`;
        const slot = slotsData[slotKey];
        if (slot && slot.content && slot.content.id) {
            const contentRef = db.collection(`artifacts/${appId}/public/data/content_items`).doc(slot.content.id);
            const contentDoc = await contentRef.get();
            if (!contentDoc.exists) {
                logger.warn(`Stale content found in ${slotKey}. Clearing slot.`);
                // If content is gone, mark the slot as empty and automatic (unlocked)
                sanitizationUpdates[slotKey] = { isLocked: false, content: null };
                wasSanitized = true;
            }
        }
    }
    // If we found any stale content, save the cleanup changes immediately
    if (wasSanitized) {
        await settingsRef.update(sanitizationUpdates);
        // Re-read the now-clean data
        const updatedSettingsDoc = await settingsRef.get();
        slotsData = updatedSettingsDoc.data();
    }
    // --- END: NEW SANITIZATION STEP ---

    const lockedSlots = new Set();
    const featuredContentIds = new Set();

    for (let i = 1; i <= 6; i++) {
        const slotKey = `slot_${i}`;
        const slot = slotsData[slotKey];
        if (slot && slot.isLocked) {
            lockedSlots.add(slotKey);
            if (slot.content && slot.content.id) {
                featuredContentIds.add(slot.content.id);
            }
        }
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const trendingContentSnapshot = await db.collection(`artifacts/${appId}/public/data/content_items`)
        .where("isActive", "==", true)
        .where("createdAt", ">=", sevenDaysAgo.toISOString())
        .orderBy("createdAt", "desc")
        .orderBy("viewCount", "desc")
        .limit(50)
        .get();

    if (trendingContentSnapshot.empty) {
        logger.info("No trending content found in the last 7 days to fill empty slots.");
        return;
    }

    const updates = {};
    let slotIndex = 1;

    for (const contentDoc of trendingContentSnapshot.docs) {
        if (slotIndex > 6) break;
        let slotKey = `slot_${slotIndex}`;
        
        // Find the next available unlocked slot
        while (lockedSlots.has(slotKey) && slotIndex <= 6) {
            slotIndex++;
            slotKey = `slot_${slotIndex}`;
        }
        if (slotIndex > 6) break;

        const contentId = contentDoc.id;
        if (featuredContentIds.has(contentId)) {
            continue; // Skip if this content is already in a locked slot
        }

        const topContent = contentDoc.data();
        updates[slotKey] = {
            isLocked: false,
            content: {
                id: contentId,
                title: topContent.title || '', creatorId: topContent.creatorId || '',
                creatorName: topContent.creatorName || '', creatorProfilePictureUrl: topContent.creatorProfilePictureUrl || '',
                customThumbnailUrl: topContent.customThumbnailUrl || '', embedUrl: topContent.embedUrl || '',
                mainUrl: topContent.mainUrl || '', viewCount: topContent.viewCount || 0,
                likeCount: topContent.likeCount || 0
            }
        };
        
        featuredContentIds.add(contentId);
        slotIndex++;
    }
    
    if (Object.keys(updates).length > 0) {
        await settingsRef.set(updates, { merge: true });
        logger.info(`Successfully updated ${Object.keys(updates).length} automatic trending video slots.`);
    }
}

// THIS IS THE NEW, ON-DEMAND FUNCTION FOR THE ADMIN BUTTON
exports.triggerTopPerformersUpdate = onCall(async (request) => {
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin)) {
      throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }
    logger.info(`Moderator '${request.auth.uid}' manually triggered updateTopPerformers.`);
    try {
        await runTopPerformersUpdate();
        return { success: true, message: "Top performers list has been refreshed." };
    } catch (error) {
        logger.error("Error in manually triggered updateTopPerformers", { error });
        throw new HttpsError("internal", "An error occurred while refreshing.", error.message);
    }
});

async function runPlatformStatsAggregation() {
    const db = admin.firestore();
    logger.info("Executing platform stats aggregation logic...");
    
    const creatorsSnapshot = await db.collection("creators").get();
    const totalUsers = creatorsSnapshot.size;
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let activeUsers30Days = 0;
    let newUsers7Days = 0;
    const userRoleBreakdown = { user: 0, creator: 0, authority: 0, admin: 0, other: 0 };

    creatorsSnapshot.forEach(doc => {
        const userData = doc.data();
        const role = userData.role || 'other';
        if (userRoleBreakdown.hasOwnProperty(role)) {
            userRoleBreakdown[role]++;
        } else {
            userRoleBreakdown.other++;
        }
        if (userData.lastLoginTimestamp && userData.lastLoginTimestamp.toDate() > thirtyDaysAgo) {
            activeUsers30Days++;
        }
        if (userData.createdAt && new Date(userData.createdAt) > sevenDaysAgo) {
            newUsers7Days++;
        }
    });

    const contentSnapshot = await db.collectionGroup("content_items").get();
    const geographyBreakdown = {};

    creatorsSnapshot.forEach(doc => {
        const userData = doc.data();
        // Bucket users by Geographic Region (Captured on Login) [1]
        const region = userData.location || 'Unknown / VPN';
        geographyBreakdown[region] = (geographyBreakdown[region] || 0) + 1;
        
        const role = userData.role || 'other';
        // ... existing role logic ...
    });

    const platformStats = {
        totalUsers,
        activeUsers30Days,
        newUsers7Days,
        userRoleBreakdown,
        totalContentItems: contentSnapshot.size,
        geographyBreakdown, // Replaced Campaigns with Geography [1]
        lastUpdated: new Date().toISOString()
    };
    await db.collection("statistics").doc("platformOverview").set(platformStats);
    logger.info("Successfully completed platform stats aggregation.", { stats: platformStats });
}

exports.triggerPlatformStatsUpdate = onCall(async (request) => {
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
      throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }
    logger.info(`Admin '${request.auth.uid}' manually triggered updatePlatformStats.`);
    try {
        await runPlatformStatsAggregation();
        return { success: true, message: "Platform statistics have been refreshed." };
    } catch (error) {
        logger.error("Error in manually triggered updatePlatformStats", { error });
        throw new HttpsError("internal", "An error occurred while updating stats.", error.message);
    }
});

exports.onPremiereUpdate = onDocumentUpdated("content_categories/{categoryId}", (event) => {
    const dataAfter = event.data.after.data();
    const dataBefore = event.data.before.data();

    if (dataAfter.name === 'Live Premieres') {
        if (dataAfter.liveStreamUrl && dataAfter.liveStreamUrl !== dataBefore.liveStreamUrl) {
            logger.info("Live Premiere has been set or updated.");
            const broadcast = {
                type: "PREMIERE_SET",
                message: "A new Live Premiere has been scheduled! Check it out in the Discover tab.",
                link: "/Discover",
                timestamp: new Date()
            };
            return admin.firestore().collection("broadcast_notifications").add(broadcast);
        }
    }
    return null;
});

exports.createBroadcast = onCall(async (request) => {
    if (request.auth.token.admin !== true && request.auth.token.authority !== true && request.auth.token.super_admin !== true) {
        throw new HttpsError("permission-denied", "You must be a moderator to create a broadcast.");
    }
    const { message, link } = request.data;
    if (!message || !link) { throw new HttpsError("invalid-argument", "Missing 'message' or 'link'."); }
    logger.info(`Moderator '${request.auth.uid}' is creating a broadcast: "${message}"`);
    const broadcast = { type: "BROADCAST", message: message, link: link, timestamp: new Date() };
    try {
        await admin.firestore().collection("broadcast_notifications").add(broadcast);
        return { success: true, message: "Broadcast created successfully." };
    } catch (error) {
        logger.error("Error creating broadcast", { error });
        throw new HttpsError("unknown", "Failed to create broadcast notification.");
    }
});

exports.runSystemDiagnostics = onCall(async (request) => {
  if (!request.auth || (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin)) {
    throw new HttpsError("permission-denied", "You must be an admin or authority.");
  }
  const uid = request.auth.uid;
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const results = {};
  logger.info(`[Diagnostics] Admin '${uid}' started diagnostics.`);
  results.authCheck = `Success: Authenticated as ${request.auth.token.role || 'user'}`;
  results.projectID = process.env.GCLOUD_PROJECT || "Not Found";
  try {
    const settingsDoc = await db.collection("settings").doc("socialLinks").get();
    results.dbReadTest = settingsDoc.exists ? "Success" : "Failed: 'settings/socialLinks' not found.";
  } catch (error) {
    results.dbReadTest = `Error: ${error.message}`;
  }
  const tempDocRef = db.collection("diagnostics").doc(`write_test_${uid}`);
  try {
    await tempDocRef.set({ timestamp: new Date(), status: 'testing' });
    await tempDocRef.delete();
    results.dbWriteTest = "Success";
  } catch (error) {
    results.dbWriteTest = `Error: ${error.message}`;
  }
  const tempFileName = `diagnostics/storage_test_${uid}.txt`;
  const tempFile = bucket.file(tempFileName);
  try {
    const testContent = `Test by ${uid} at ${new Date().toISOString()}`;
    await tempFile.save(testContent);
    const [contents] = await tempFile.download();
    if (contents.toString() !== testContent) throw new Error("Content mismatch.");
    await tempFile.delete();
    results.storageTest = "Success";
  } catch (error) {
    results.storageTest = `Error: ${error.message}`;
    try { await tempFile.delete(); } catch (cleanupError) {}
  }
  logger.info(`[Diagnostics] Completed for '${uid}'.`, { results });
  return { diagnosticResults: results };
});

exports.deleteNotification = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) { throw new HttpsError("unauthenticated", "You must be logged in."); }
    const { notificationId } = request.data;
    if (!notificationId) { throw new HttpsError("invalid-argument", "Missing 'notificationId'."); }
    const db = admin.firestore();
    const notificationRef = db.collection("notifications").doc(notificationId);
    const userRef = db.collection("creators").doc(uid); // <-- Reference to the user's profile

    try {
        // Use a transaction to guarantee both actions succeed or fail together.
        await db.runTransaction(async (transaction) => {
            const notificationDoc = await transaction.get(notificationRef);
            if (!notificationDoc.exists) {
                // If the notification is already gone, do nothing.
                return;
            }

            const notificationData = notificationDoc.data();
            if (notificationData.userId !== uid) {
                throw new HttpsError("permission-denied", "You do not have permission to delete this.");
            }
            
            // --- THIS IS THE FIX ---
            // If the notification being deleted was unread...
            if (notificationData.isRead === false) {
                // ...decrement the user's badge count.
                transaction.update(userRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(-1) });
            }

            // Always delete the notification itself.
            transaction.delete(notificationRef);
        });

        return { success: true, message: "Notification deleted." };

    } catch (error) {
        logger.error(`Error deleting notification '${notificationId}'`, { error });
        if (error instanceof HttpsError) { throw error; }
        throw new HttpsError("unknown", "An error occurred.");
    }
});

        exports.markNotificationAsRead = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to mark notifications as read.");
    }

    const { notificationId } = request.data;
    if (!notificationId) {
        throw new HttpsError("invalid-argument", "The function must be called with a 'notificationId'.");
    }

    const db = admin.firestore();
    const notificationRef = db.collection("notifications").doc(notificationId);
    const userRef = db.collection("creators").doc(uid);

    try {
        const notificationDoc = await notificationRef.get();
        if (!notificationDoc.exists) {
            logger.warn(`User '${uid}' tried to mark non-existent notification '${notificationId}' as read.`);
            return { success: true, message: "Notification not found." };
        }

        const notificationData = notificationDoc.data();
        
        if (notificationData.userId !== uid) {
            throw new HttpsError("permission-denied", "You do not have permission to modify this notification.");
        }

        // Only decrement the counter if the notification was previously unread.
        if (notificationData.isRead === false) {
            await db.runTransaction(async (transaction) => {
                transaction.update(notificationRef, { isRead: true });
                transaction.update(userRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(-1) });
            });
            return { success: true, message: "Notification marked as read and counter updated." };
        } else {
            // If it was already read, just ensure it's marked as such, without touching the counter.
            await notificationRef.update({ isRead: true });
            return { success: true, message: "Notification was already marked as read." };
        }

    } catch (error) {
        logger.error(`Error marking notification '${notificationId}' as read for user '${uid}'`, { error });
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "An unexpected error occurred while updating the notification.");
    }
});

exports.onPledgeDelete = onDocumentDeleted("paymentPledges/{pledgeId}", async (event) => {
    const deletedPledge = event.data.data();

    // Exit if the pledge wasn't in 'pending' state or has no user ID.
    if (deletedPledge.status !== 'pending' || !deletedPledge.userId) {
        return null;
    }

    logger.info(`Pledge '${event.params.pledgeId}' was denied. Creating notification for user '${deletedPledge.userId}'.`);
    
    const db = admin.firestore();
    const userId = deletedPledge.userId;
    const userRef = db.collection("creators").doc(userId);

    let messageBody = `Your payment pledge of $${deletedPledge.amount.toFixed(2)} was not approved.`;
    if (deletedPledge.paymentType === 'promotedStatus') {
        messageBody = `Your Promoted Status booking was cancelled. Please contact support for details.`;
    }

    // Based on the requirements, chat messages are Push and Toast, but not permanent Inbox notifications.
        const notificationPayload = {
            userId: recipientId,
            title: `New Message from ${senderName}`,
            body: text.substring(0, 100),
            link: `/chat/${chatId}`,
            deliveryType: ["push", "toast"], // THE FIX: "inbox" is removed.
            notificationType: "NEW_CHAT_MESSAGE",
            sound: false, // Per requirements
            isRead: false,
            status: "pending",
            timestamp: admin.firestore.FieldValue.serverTimestamp() // Corrected
        };

    // Write the single notification document and update the user's badge.
    await db.collection("notifications").add(notificationPayload);
    await userRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });

    return null;
});

exports.onNewFollower = onDocumentCreated("creators/{creatorId}/followers/{followerId}", async (event) => {
    const { creatorId, followerId } = event.params;
    if (creatorId === followerId) return null; // A user cannot follow themselves.

    const db = admin.firestore();
    try {
        const followerDoc = await db.collection("creators").doc(followerId).get();
        if (!followerDoc.exists) return null;
        
        const userToNotifyRef = db.collection("creators").doc(creatorId);
        const followerName = followerDoc.data().creatorName || "A new user";

        const notificationPayload = {
            userId: creatorId,
            title: "New Follower!",
            body: `${followerName} is now following you!`,
            link: `/user/${followerId}`, // Links directly to the follower's profile
            deliveryType: ["inbox", "push"],
            notificationType: "NEW_FOLLOWER",
            sound: true,
            isRead: false,
            status: "pending",
            timestamp: admin.firestore.FieldValue.serverTimestamp() // Corrected
        };

        // Write the single notification document and update the user's badge.
        await db.collection("notifications").add(notificationPayload);
        await userToNotifyRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });

    } catch (error) {
        logger.error(`Failed to process 'onNewFollower' notification for creator '${creatorId}'`, { error });
    }
    return null;
});

    // functions/index.js

// =====================================================================
// ============== START: PRIVATE CHAT PUSH NOTIFICATIONS ===============
// =====================================================================
exports.onNewChatMessage = onDocumentCreated("chats/{chatId}/messages/{messageId}", async (event) => {
    const messageData = event.data.data();
    if (!messageData) return null;

    const { senderId, text } = messageData;
    const { chatId } = event.params;
    const db = admin.firestore();

    try {
        const chatDoc = await db.collection("chats").doc(chatId).get();
        if (!chatDoc.exists) return null;

        const recipientId = chatDoc.data().participants.find(uid => uid !== senderId);
        if (!recipientId) return null;

        const senderDoc = await db.collection("creators").doc(senderId).get();
        const senderName = senderDoc.exists ? senderDoc.data().creatorName : "Someone";

        // Based on the requirements, chat messages are Push and Toast, but not permanent Inbox notifications.
        const notificationPayload = {
            userId: recipientId,
            title: `New Message from ${senderName}`,
            body: text.substring(0, 100),
            link: `/chat/${chatId}`,
            deliveryType: ["push", "toast"], // Does not include "inbox"
            notificationType: "NEW_CHAT_MESSAGE",
            sound: false, // Per requirements
            isRead: false,
            status: "pending",
            timestamp: admin.firestore.FieldValue.serverTimestamp() // Corrected
        };

        // Write the single notification document. Our new system will handle the push delivery.
        await db.collection("notifications").add(notificationPayload);

    } catch (error) {
        logger.error(`Error in onNewChatMessage for chat '${chatId}':`, error);
    }
    return null;
});
// =====================================================================
// =============== END: PRIVATE CHAT PUSH NOTIFICATIONS ================
// =====================================================================

    // =====================================================================
// =========== START: CHAT CONVERSATION DELETION LOGIC =================
// =====================================================================
exports.hideChatForUser = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to delete a conversation.");
    }

    const { chatId } = request.data;
    if (!chatId) {
        throw new HttpsError("invalid-argument", "The function must be called with a 'chatId'.");
    }

    const db = admin.firestore();
    const chatRef = db.collection("chats").doc(chatId);

    try {
        const chatDoc = await chatRef.get();
        if (!chatDoc.exists) {
            // If the chat doesn't exist, it's already gone. Return success.
            return { success: true, message: "Chat already deleted." };
        }

        const chatData = chatDoc.data();
        if (!chatData.participants.includes(uid)) {
            // Security rule: a user cannot delete a conversation they are not part of.
            throw new HttpsError("permission-denied", "You do not have permission to delete this chat.");
        }

        // Atomically add the user's UID to the 'hiddenFor' array.
        await chatRef.update({
            hiddenFor: admin.firestore.FieldValue.arrayUnion(uid)
        });

        logger.info(`User '${uid}' soft-deleted chat '${chatId}'.`);
        return { success: true, message: "Conversation successfully deleted from your list." };

    } catch (error) {
        logger.error(`Error hiding chat '${chatId}' for user '${uid}':`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while deleting the conversation.");
    }
});
// =====================================================================
// ============= END: CHAT CONVERSATION DELETION LOGIC =================
// =====================================================================

  

// Soft-deletes a single message within a private chat.
exports.deleteChatMessagePrivate = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) { throw new HttpsError("unauthenticated", "You must be logged in."); }

    const { chatId, messageId } = request.data;
    if (!chatId || !messageId) { throw new HttpsError("invalid-argument", "Missing chatId or messageId."); }

    const db = admin.firestore();
    const messageRef = db.doc(`chats/${chatId}/messages/${messageId}`);
    try {
        const messageDoc = await messageRef.get();
        if (!messageDoc.exists) {
            return { success: true, message: "Message already deleted." };
        }

        if (messageDoc.data().senderId !== uid) {
            throw new HttpsError("permission-denied", "You can only delete your own messages.");
        }
        
        // Perform the simple soft delete. No other logic.
        await messageRef.update({
            text: "This message was deleted",
            isDeleted: true
        });

        return { success: true, message: "Message deleted." };

    } catch (error) {
        logger.error(`Error during simple delete for private chat message '${messageId}'`, { errorMessage: error.message });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred.");
    }
});

       // --- START: REVISED CHAT MESSAGE SENDING FUNCTION ---

exports.sendChatMessagePrivate = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to send a message.");
    }

    const { chatId, text, replyTo } = request.data;
    if (!chatId || !text || !text.trim()) {
        throw new HttpsError("invalid-argument", "Missing chatId or message text.");
    }

    const db = admin.firestore();
    const chatRef = db.collection("chats").doc(chatId);
    const messageRef = chatRef.collection("messages").doc();

    const newMessage = {
        senderId: uid,
        text: text.trim(),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        replyTo: replyTo || null,
    };

    try {
        let chatData; 

        await db.runTransaction(async (transaction) => {
            const chatDoc = await transaction.get(chatRef);
            if (!chatDoc.exists) {
                throw new HttpsError("not-found", "The chat conversation does not exist.");
            }
            chatData = chatDoc.data(); 
            const otherParticipantId = chatData.participants.find(p => p !== uid);

            transaction.set(messageRef, newMessage);

            transaction.update(chatRef, {
                lastMessage: {
                    senderId: uid,
                    text: text.trim()
                },
                lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                unreadBy: admin.firestore.FieldValue.arrayUnion(otherParticipantId)
            });
        });

        // Chat Cap Optimization: Prune older messages if count exceeds 100 to save space [1]
        const messagesRef = chatRef.collection("messages");
        const countSnap = await messagesRef.count().get();
        const totalCount = countSnap.data().count;
        if (totalCount > 100) {
            const oldestMsgsQuery = messagesRef.orderBy("timestamp", "asc").limit(totalCount - 100);
            const oldestSnap = await oldestMsgsQuery.get();
            if (!oldestSnap.empty) {
                const pruneBatch = db.batch();
                oldestSnap.docs.forEach(doc => pruneBatch.delete(doc.ref));
                await pruneBatch.commit();
                logger.info(`Pruned ${oldestSnap.size} old messages from chat '${chatId}' to maintain the 100-message cap.`);
            }
        }
        
        return { success: true, message: "Message sent." };

    } catch (error) {
        logger.error(`Error in sendChatMessagePrivate for user '${uid}' in chat '${chatId}':`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while sending the message.");
    }
});

// --- END: REVISED CHAT MESSAGE SENDING FUNCTION ---
 
   
        // --- START: NEW FUNCTION FOR UNREAD MESSAGE INDICATOR ---

exports.updateChatLastSeen = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const { chatId } = request.data;
    if (!chatId) {
        throw new HttpsError("invalid-argument", "Missing chatId.");
    }

    const db = admin.firestore();
    const chatRef = db.collection("chats").doc(chatId);

    try {
        // This robustly sets a map field with the current user's ID and the
        // exact server time they viewed the chat.
        await chatRef.set({
            lastSeenBy: {
                [uid]: admin.firestore.FieldValue.serverTimestamp()
            }
        }, { merge: true });

        return { success: true };
    } catch (error) {
        logger.warn(`Could not update lastSeenBy for user '${uid}' in chat '${chatId}'.`, { error: error.message });
        return { success: false };
    }
});

  
// =====================================================================
// ============ START: AUTOMATIC CHAT PREVIEW SYNCHRONIZER V2 ===========
// =====================================================================

// This is the core logic that will be shared by all three triggers.
const synchronizeChatPreviewLogic = async (chatId) => {
    const db = admin.firestore();
    const chatRef = db.doc(`chats/${chatId}`);
    const messagesRef = chatRef.collection("messages");

    logger.info(`Synchronizing chat preview for chat '${chatId}'.`);

    try {
        // THE DEFINITIVE FIX: Use a simple, VALID query to get the most recent messages.
        const latestMessagesQuery = messagesRef
            .orderBy("timestamp", "desc")
            .limit(10); // Fetch a small buffer to find the latest non-deleted one.
        
        const snapshot = await latestMessagesQuery.get();

        // Now, find the first message in the results that is NOT deleted.
        const newLatestMessageDoc = snapshot.docs.find(doc => doc.data().isDeleted !== true);

        if (newLatestMessageDoc) {
            // If we found a valid message, update the preview.
            const newLatestMessage = newLatestMessageDoc.data();
            await chatRef.update({
                lastMessage: {
                    senderId: newLatestMessage.senderId,
                    text: newLatestMessage.text
                },
                lastMessageTimestamp: newLatestMessage.timestamp
            });
            logger.info(`Successfully updated chat preview for '${chatId}'.`);
        } else {
            // If no valid messages were found in the last 10, the chat is effectively empty.
            await chatRef.update({
                lastMessage: null,
                lastMessageTimestamp: null
            });
            logger.info(`Chat '${chatId}' has no recent valid messages. Cleared chat preview.`);
        }
        return null;

    } catch (error) {
        logger.error(`FATAL Error synchronizing chat preview for '${chatId}':`, {
            errorMessage: error.message,
            stack: error.stack
        });
        return null;
    }
};

// Trigger for when a NEW message is CREATED.
exports.synchronizeOnMessageCreate = onDocumentCreated("chats/{chatId}/messages/{messageId}", (event) => {
    return synchronizeChatPreviewLogic(event.params.chatId);
});

// Trigger for when a message is UPDATED (e.g., soft-deleted).
exports.synchronizeOnMessageUpdate = onDocumentUpdated("chats/{chatId}/messages/{messageId}", (event) => {
    return synchronizeChatPreviewLogic(event.params.chatId);
});

// Trigger for when a message is hard-DELETED.
exports.synchronizeOnMessageDelete = onDocumentDeleted("chats/{chatId}/messages/{messageId}", (event) => {
    return synchronizeChatPreviewLogic(event.params.chatId);
});

// =====================================================================
// ============== END: AUTOMATIC CHAT PREVIEW SYNCHRONIZER V2 ============
// =====================================================================

    // --- START: NEW FUNCTION TO BE ADDED ---

exports.reactToChatMessagePrivate = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) { throw new HttpsError("unauthenticated", "You must be logged in to react."); }

    const { chatId, messageId, emoji } = request.data;
    if (!chatId || !messageId || !emoji) { throw new HttpsError("invalid-argument", "Missing chatId, messageId, or emoji."); }

    const db = admin.firestore();
    const messageRef = db.doc(`chats/${chatId}/messages/${messageId}`);

    try {
        await db.runTransaction(async (transaction) => {
            const messageDoc = await transaction.get(messageRef);
            if (!messageDoc.exists) { throw new HttpsError("not-found", "The message you are reacting to does not exist."); }

            const messageData = messageDoc.data();
            const reactions = messageData.reactions || {}; // e.g., { '👍': ['uid1', 'uid2'] }

            // Ensure the emoji property exists as an array
            if (!reactions[emoji]) {
                reactions[emoji] = [];
            }

            const userIndex = reactions[emoji].indexOf(uid);

            if (userIndex > -1) {
                // User has already reacted with this emoji, so remove the reaction (toggle off)
                reactions[emoji].splice(userIndex, 1);
                // If the array for this emoji is now empty, remove the emoji key
                if (reactions[emoji].length === 0) {
                    delete reactions[emoji];
                }
            } else {
                // User has not reacted with this emoji, so add them
                reactions[emoji].push(uid);
            }
            
            transaction.update(messageRef, { reactions: reactions });
        });
        return { success: true, message: "Reaction updated." };
    } catch (error) {
        logger.error(`Error reacting to message '${messageId}' by user '${uid}'`, { error });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while adding the reaction.");
    }
});

// --- END: NEW FUNCTION TO BE ADDED ---

// --- START: NEW FUNCTION TO MARK CHATS AS READ ---
exports.markChatAsRead = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }

    const { chatId } = request.data;
    if (!chatId) {
        throw new HttpsError("invalid-argument", "Missing chatId.");
    }

    const db = admin.firestore();
    const chatRef = db.collection("chats").doc(chatId);

    try {
        const chatDoc = await chatRef.get();
        if (!chatDoc.exists) {
            // If the chat doesn't exist, there's nothing to do.
            return { success: true, message: "Chat not found." };
        }

        const chatData = chatDoc.data();
        // SECURITY CHECK: Ensure the user is actually a participant in this chat.
        if (!chatData.participants?.includes(uid)) {
            throw new HttpsError("permission-denied", "You do not have permission to modify this chat.");
        }

        // Atomically remove the user's UID from the 'unreadBy' array.
        // This marks the chat as "read" for the current user.
        await chatRef.update({
            unreadBy: admin.firestore.FieldValue.arrayRemove(uid)
        });

        return { success: true, message: "Chat marked as read." };

    } catch (error) {
        logger.error(`Error marking chat '${chatId}' as read for user '${uid}':`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred.");
    }
});
// --- END: NEW FUNCTION TO MARK CHATS AS READ ---

    exports.onPayoutRequestUpdate = onDocumentUpdated("payoutRequests/{requestId}", async (event) => {
    const dataBefore = event.data.before.data();
    const dataAfter = event.data.after.data();
    const creatorId = dataAfter.creatorId;

    // Exit if the status didn't change from 'pending' or if there's no creator.
    if (dataBefore.status !== 'pending' || !creatorId) {
        return null;
    }

    const db = admin.firestore();
    const userRef = db.collection("creators").doc(creatorId);
    let notificationPayload;

    if (dataAfter.status === 'paid') {
        logger.info(`Payout request '${event.params.requestId}' was paid. Creating notification for creator '${creatorId}'.`);
        notificationPayload = {
            userId: creatorId,
            title: "Payout Processed",
            body: `Your payout request for "${dataAfter.campaignTitle}" has been processed and paid.`,
            link: "/CreatorDashboard",
            deliveryType: ["inbox", "push"],
            notificationType: "PAYOUT_PAID",
            sound: true,
        };
    } else if (dataAfter.status === 'dismissed') {
        logger.info(`Payout request '${event.params.requestId}' was dismissed. Creating notification for creator '${creatorId}'.`);
        notificationPayload = {
            userId: creatorId,
            title: "Payout Update",
            body: `Your payout request for "${dataAfter.campaignTitle}" was dismissed. Please contact support for details.`,
            link: "/Contact",
            deliveryType: ["inbox", "push"],
            notificationType: "PAYOUT_DISMISSED",
            sound: true,
        };
    }

    if (notificationPayload) {
        await db.collection("notifications").add({
            ...notificationPayload,
            isRead: false,
            status: "pending",
            timestamp: admin.firestore.FieldValue.serverTimestamp() // Corrected
        });
        await userRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
    }

    return null;
});

exports.oEmbedProxy = onCall(async (request) => {
  const fetch = require("node-fetch");
  const { url, platform } = request.data;

  if (!url || !platform) {
    throw new HttpsError("invalid-argument", "Requires 'url' and 'platform'.");
  }

  let oEmbedUrl;
  switch(platform) {
      case 'tiktok':
          oEmbedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
          break;
      case 'vimeo':
          oEmbedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
          break;
      default:
          throw new HttpsError("invalid-argument", `Platform '${platform}' not supported.`);
  }

  const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
  const finalUrl = proxyUrl + oEmbedUrl;

  try {
    const response = await fetch(finalUrl, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!response.ok) {
      logger.error(`oEmbedProxy fetch failed for ${oEmbedUrl}`, {status: response.status});
      throw new HttpsError("unavailable", `Proxy server error. Please try again later.`);
    }
    return await response.json();
  } catch (error) {
    logger.error(`Error in oEmbedProxy function for ${platform}`, { error: error.message });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("unknown", "An unexpected error occurred.");
  }
});

exports.onNewContentPublished = onDocumentCreated("artifacts/{appId}/public/data/content_items/{contentId}", async (event) => {
    const newContent = event.data.data();
    const creatorId = newContent.creatorId;
    if (!creatorId) return null;
    
    logger.info(`New content from creator '${creatorId}'. Fanning out.`);
    const db = admin.firestore();
    try {
        const followersSnapshot = await db.collection("creators").doc(creatorId).collection("followers").get();
        if (followersSnapshot.empty) return null;
        
        const feedItem = {
            originalContentId: event.params.contentId,
            creatorId: newContent.creatorId,
            creatorName: newContent.creatorName || '',
            creatorProfilePictureUrl: newContent.creatorProfilePictureUrl || '',
            title: newContent.title || '',
            embedUrl: newContent.embedUrl || '',
            mainUrl: newContent.mainUrl || '',
            customThumbnailUrl: newContent.customThumbnailUrl || '',
            // THE FIX: Use the original content's creation date, but fall back to a server timestamp.
            createdAt: newContent.createdAt ? admin.firestore.Timestamp.fromDate(new Date(newContent.createdAt)) : admin.firestore.FieldValue.serverTimestamp(),
            likeCount: 0,
        };

        const batch = db.batch();
        followersSnapshot.forEach(doc => {
            const followerId = doc.id;
            const feedRef = db.collection("creators").doc(followerId).collection("feed").doc(event.params.contentId);
            batch.set(feedRef, feedItem);
            const followingRef = db.collection("creators").doc(followerId).collection("following").doc(creatorId);
            batch.set(followingRef, { hasNewContent: true }, { merge: true });
        });
        await batch.commit();
        logger.info(`Fanned out content and set ${followersSnapshot.size} flags.`);
        return null;
    } catch (error) {
        logger.error(`Error fanning out content for creator '${creatorId}'`, { error });
        return null;
    }
});
        
        exports.updateExchangeRates = onSchedule("every 24 hours", async (event) => {
    const fetch = require("node-fetch");
    const apiKey = "7200b18f4f790c1bc0042116"; // Your actual API key
    const apiUrl = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;

    logger.info("Running scheduled job: Fetching daily currency exchange rates.");

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }
        const data = await response.json();
        if (data.result === 'error') {
            throw new Error(`API returned an error: ${data['error-type']}`);
        }

        const ratesRef = admin.firestore().collection("settings").doc("currencyRates");
        await ratesRef.set({
            rates: data.conversion_rates,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        
        logger.info("Successfully updated currency exchange rates in Firestore.");

    } catch (error) {
        logger.error("FATAL: Failed to update currency exchange rates.", { error: error.message });
    }
    return null; // Required for scheduled functions
});
              
exports.removeFeaturedContent = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const { appId } = request.data;
    if (!appId) {
        throw new HttpsError("invalid-argument", "The function must be called with 'appId'.");
    }

    logger.info(`User '${uid}' initiated removal of featured content.`);
    const db = admin.firestore();

    try {
        await db.runTransaction(async (transaction) => {
            const creatorRef = db.collection("creators").doc(uid);
            const creatorDoc = await transaction.get(creatorRef);

            if (!creatorDoc.exists) {
                throw new HttpsError("not-found", "Your creator profile could not be found.");
            }

            const featuredContentId = creatorDoc.data().featuredVideoLink?.liveFeedContentId;
            if (!featuredContentId) {
                logger.info(`User '${uid}' had no featured content to remove.`);
                return;
            }

            const contentRef = db.collection(`artifacts/${appId}/public/data/content_items`).doc(featuredContentId);
            
            // This is a safety check. If the document doesn't exist, we don't need to update it.
            const contentDoc = await transaction.get(contentRef);
            if(contentDoc.exists){
                transaction.update(contentRef, { isFeatured: false });
            }

            transaction.update(creatorRef, { featuredVideoLink: null });
        });

        logger.info(`Successfully removed featured content for user '${uid}'.`);
        return { success: true, message: "Featured link has been removed." };

    } catch (error) {
        logger.error(`Error removing featured content for user '${uid}'`, { error });
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "An unexpected error occurred while removing your featured item.");
    }
});

exports.updateLikeCount = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to like items.");
    }
    const { itemId, itemType, isLiking } = request.data;
    if (!itemId || !itemType || typeof isLiking !== 'boolean') {
        throw new HttpsError("invalid-argument", "The function requires 'itemId', 'itemType', and 'isLiking'.");
    }

    logger.info(`User '${uid}' is ${isLiking ? 'liking' : 'unliking'} ${itemType} '${itemId}'.`);
    const db = admin.firestore();

    let itemRef;
    if (itemType === 'content') {
        itemRef = db.collection(`artifacts/production-app-id/public/data/content_items`).doc(itemId);
    } else if (itemType === 'event') {
        itemRef = db.collection('events').doc(itemId);
    } else {
        throw new HttpsError("invalid-argument", `Unsupported itemType: '${itemType}'.`);
    }

    const likeRef = itemRef.collection("likes").doc(uid);
    const increment = isLiking ? 1 : -1;

    try {
        let itemData;
        let likerName = "Someone";

        await db.runTransaction(async (transaction) => {
            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists) {
                throw new HttpsError("not-found", `The ${itemType} you are trying to like does not exist.`);
            }
            itemData = itemDoc.data();

            if (isLiking) {
                // Get the user's profile to store their picture on the content item
                const userRef = db.collection("creators").doc(uid);
                const userDoc = await transaction.get(userRef);
                const userProfileUrl = userDoc.exists ? userDoc.data().profilePictureUrl : null;
                likerName = userDoc.exists ? (userDoc.data().creatorName || "Someone") : "Someone";

                transaction.set(likeRef, { likedAt: new Date().toISOString() });
                transaction.update(itemRef, { 
                    likeCount: admin.firestore.FieldValue.increment(increment),
                    lastLikerProfileUrl: userProfileUrl || null // Add the new field
                });

            } else {
                transaction.delete(likeRef);
                transaction.update(itemRef, { likeCount: admin.firestore.FieldValue.increment(increment) });
            }
        });

        // Silent in-app toast notification (stored temporarily for 2 hours)
        const contentOwnerId = itemData ? (itemData.creatorId || itemData.postedByUid) : null;
        if (isLiking && contentOwnerId && contentOwnerId !== uid) {
            const itemTitle = itemData ? (itemData.title || itemData.eventTitle || "your post") : "your post";
            const link = itemType === 'content' ? `/content/${itemId}` : '/Discover';

            await db.collection("notifications").add({
                userId: contentOwnerId,
                title: "New Like!",
                body: `${likerName} liked your post "${itemTitle}"`,
                link: link,
                deliveryType: ["toast"], // Triggers toast, auto-expires in 2 hours
                notificationType: "NEW_LIKE",
                sound: false,
                isRead: false,
                status: "pending",
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            }).catch(e => logger.warn("Failed to dispatch silent like notification", e));
        }

        return { success: true, message: `Successfully ${isLiking ? 'liked' : 'unliked'} item.` };
    } catch (error) {
        logger.error(`Error updating like count for ${itemType} '${itemId}' by user '${uid}'`, { error });
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "An unexpected error occurred while updating the like count.");
    }
});

     exports.getLikedByUsers = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to view this information.");
    }

    const { itemId, itemType } = request.data;
    if (!itemId || !itemType) {
        throw new HttpsError("invalid-argument", "The function requires 'itemId' and 'itemType'.");
    }

    logger.info(`User '${uid}' is fetching users who liked ${itemType} '${itemId}'.`);
    const db = admin.firestore();
    
    let itemRef;
    if (itemType === 'content') {
        itemRef = db.collection(`artifacts/production-app-id/public/data/content_items`).doc(itemId);
    } else if (itemType === 'event') {
        itemRef = db.collection('events').doc(itemId);
    } else {
        throw new HttpsError("invalid-argument", `Unsupported itemType: '${itemType}'.`);
    }

    try {
        const likesSnapshot = await itemRef.collection("likes").get();
        if (likesSnapshot.empty) {
            return { users: [] };
        }

        const userIds = likesSnapshot.docs.map(doc => doc.id);
        
        const userPromises = [];
        const creatorRef = db.collection("creators");

        for (let i = 0; i < userIds.length; i += 10) {
            const batchIds = userIds.slice(i, i + 10);
            const query = creatorRef.where(admin.firestore.FieldPath.documentId(), 'in', batchIds).get();
            userPromises.push(query);
        }

        const userSnapshots = await Promise.all(userPromises);
        const users = [];
        userSnapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                const userData = doc.data();
                users.push({
                    id: doc.id,
                    creatorName: userData.creatorName || "NVA User",
                    profilePictureUrl: userData.profilePictureUrl || ''
                });
            });
        });

        return { users: users };

    } catch (error) {
        logger.error(`Error fetching liked by users for ${itemType} '${itemId}'`, { error });
        if (error.code === 5) { // 'NOT_FOUND' error code
             throw new HttpsError("not-found", `The ${itemType} does not exist.`);
        }
        throw new HttpsError("internal", "An unexpected error occurred while fetching the list of users.");
    }
});   

exports.incrementViewCount = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to have your view counted.");
    }
    const { itemId, itemType } = request.data;
    if (!itemId || !itemType) {
        throw new HttpsError("invalid-argument", "The function requires 'itemId' and 'itemType'.");
    }

    logger.info(`Incrementing view count for ${itemType} '${itemId}' by user '${uid}'.`);
    const db = admin.firestore();
    
    let itemRef;
    let fieldToUpdate;

    if (itemType === 'content') {
        itemRef = db.collection(`artifacts/production-app-id/public/data/content_items`).doc(itemId);
        fieldToUpdate = 'viewCount';
    } else if (itemType === 'event') {
        itemRef = db.collection('events').doc(itemId);
        fieldToUpdate = 'totalViewCount';
    } else {
        throw new HttpsError("invalid-argument", `Unsupported itemType: '${itemType}'.`);
    }

    try {
        await itemRef.update({ [fieldToUpdate]: admin.firestore.FieldValue.increment(1) });
        return { success: true, message: "View count incremented." };
    } catch (error) {
        logger.error(`Error incrementing view count for ${itemType} '${itemId}'`, { error });
        // Check if the error is due to the document not existing.
        if (error.code === 5) { // 'NOT_FOUND' error code
             throw new HttpsError("not-found", `The ${itemType} you are trying to view does not exist.`);
        }
        throw new HttpsError("internal", "An unexpected error occurred while incrementing the view count.");
    }
});

exports.clearNewContentFlags = onCall({ enforceAppCheck: false, cors: true }, async (request) => {
    // Safety check: Prevent crash if auth is temporarily undefined
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const uid = request.auth.uid;

    logger.info(`User '${uid}' is clearing their new content flags.`);
    const db = admin.firestore();
    
    try {
        const followingRef = db.collection("creators").doc(uid).collection("following");
        const snapshot = await followingRef.where("hasNewContent", "==", true).get();

        if (snapshot.empty) {
            logger.info(`No new content flags to clear for user '${uid}'.`);
            return { success: true, message: "No flags to clear." };
        }

        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.update(doc.ref, { hasNewContent: false });
        });
        
        await batch.commit();

        logger.info(`Successfully cleared ${snapshot.size} new content flags for user '${uid}'.`);
        return { success: true, message: `Cleared ${snapshot.size} flags.` };

    } catch (error) {
        logger.error(`Error clearing new content flags for user '${uid}'`, { error });
        throw new HttpsError("internal", "An unexpected error occurred while clearing notifications.");
    }
});

exports.toggleFollow = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to follow users.");
    }

    const { targetUserId, isFollowing } = request.data;
    if (!targetUserId || typeof isFollowing !== 'boolean') {
        throw new HttpsError("invalid-argument", "Missing 'targetUserId' or 'isFollowing' parameter.");
    }
    if (uid === targetUserId) {
        throw new HttpsError("invalid-argument", "You cannot follow yourself.");
    }

    const db = admin.firestore();
    const currentUserRef = db.collection("creators").doc(uid);
    const targetUserRef = db.collection("creators").doc(targetUserId);
    
    logger.info(`User '${uid}' is attempting to ${isFollowing ? 'follow' : 'unfollow'} user '${targetUserId}'.`);

    try {
        await db.runTransaction(async (transaction) => {
            const currentUserFollowingRef = currentUserRef.collection("following").doc(targetUserId);
            const targetUserFollowersRef = targetUserRef.collection("followers").doc(uid);
            
            const [currentUserDoc, targetUserDoc] = await Promise.all([
                transaction.get(currentUserRef),
                transaction.get(targetUserRef)
            ]);

            if (!currentUserDoc.exists || !targetUserDoc.exists) {
                throw new HttpsError("not-found", "One or both user profiles could not be found.");
            }
            
            const currentUserData = currentUserDoc.data();
            const targetUserData = targetUserDoc.data();

            if (isFollowing) {
                // Denormalize data for the "following" list
                transaction.set(currentUserFollowingRef, { 
                    followedAt: new Date(),
                    creatorName: targetUserData.creatorName || '',
                    profilePictureUrl: targetUserData.profilePictureUrl || ''
                });
                // Denormalize data for the "followers" list
                transaction.set(targetUserFollowersRef, { 
                    followedAt: new Date(),
                    creatorName: currentUserData.creatorName || '',
                    profilePictureUrl: currentUserData.profilePictureUrl || ''
                });
                
                // Read the current value or default to 0 before calculating.
                const newFollowingCount = (currentUserData.followingCount || 0) + 1;
                const newFollowerCount = (targetUserData.followerCount || 0) + 1;
                
                transaction.update(currentUserRef, { followingCount: newFollowingCount });
                transaction.update(targetUserRef, { followerCount: newFollowerCount });
            } else {
                transaction.delete(currentUserFollowingRef);
                transaction.delete(targetUserFollowersRef);

                // THE FIX: Read the current value, default to 0, and ensure it doesn't go below 0.
                const newFollowingCount = Math.max(0, (currentUserData.followingCount || 0) - 1);
                const newFollowerCount = Math.max(0, (targetUserData.followerCount || 0) - 1);

                transaction.update(currentUserRef, { followingCount: newFollowingCount });
                transaction.update(targetUserRef, { followerCount: newFollowerCount });
            }
        });

        return { success: true, message: `Successfully ${isFollowing ? 'followed' : 'unfollowed'} user.` };

    } catch (error) {
        logger.error(`Error in toggleFollow transaction for user '${uid}' -> '${targetUserId}'`, { error });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while updating follow status.");
    }
});

        // Note: The 'onRequest' import is no longer needed for this function, but other functions might use it.
// Ensure 'onCall' and 'HttpsError' are imported from "firebase-functions/v2/https".
// const {onCall, HttpsError} = require("firebase-functions/v2/https");

exports.toggleBlockUser = onCall({ cors: true }, async (request) => {
    // With onCall, Firebase automatically checks for authentication.
    // If the user isn't logged in, 'request.auth' will be null and the function will throw an 'unauthenticated' error before this code even runs.
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to block users.");
    }
    const uid = request.auth.uid;

    // Data is now in 'request.data' instead of 'req.body.data'
    const { targetUserId } = request.data;
    if (!targetUserId) {
        logger.error("Block attempt with missing targetUserId.", { uid: uid });
        throw new HttpsError("invalid-argument", "Missing 'targetUserId' parameter.");
    }
    if (uid === targetUserId) {
        logger.warn(`User '${uid}' attempted to block themselves.`);
        throw new HttpsError("failed-precondition", "You cannot block yourself.");
    }

    const db = admin.firestore();
    const currentUserRef = db.collection("creators").doc(uid);
    const targetUserRef = db.collection("creators").doc(targetUserId);
    
    logger.info(`User '${uid}' is attempting to toggle block on user '${targetUserId}'.`);

    try {
        let isCurrentlyBlocked; // To determine the final status message

        await db.runTransaction(async (transaction) => {
            const currentUserBlockListRef = currentUserRef.collection("blockedUsers").doc(targetUserId);
            const targetUserBlockedByRef = targetUserRef.collection("blockedBy").doc(uid);

            const [currentUserDoc, targetUserDoc, blockDoc] = await Promise.all([
                transaction.get(currentUserRef),
                transaction.get(targetUserRef),
                transaction.get(currentUserBlockListRef)
            ]);

            if (!currentUserDoc.exists) {
                throw new HttpsError("not-found", "Your user profile could not be found.");
            }
            if (!targetUserDoc.exists) {
                throw new HttpsError("not-found", "The user you are trying to block does not exist.");
            }
            
            isCurrentlyBlocked = blockDoc.exists;

            if (isCurrentlyBlocked) {
                // Unblocking
                transaction.delete(currentUserBlockListRef);
                transaction.delete(targetUserBlockedByRef);
            } else {
                // Blocking
                transaction.set(currentUserBlockListRef, { blockedAt: new Date() });
                transaction.set(targetUserBlockedByRef, { blockedAt: new Date() });
            }
        });

        // onCall functions return data directly, instead of using res.send()
        const message = isCurrentlyBlocked ? "User unblocked successfully." : "User blocked successfully.";
        return { success: true, message: message };

    } catch (error) {
        logger.error(`Error in toggleBlockUser transaction for user '${uid}' -> '${targetUserId}'`, { error: error.message });
        // If it's already an HttpsError, re-throw it. Otherwise, wrap it.
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", `An unexpected error occurred: ${error.message}`);
    }
});

exports.createContentReport = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to report content.");
    }

    const { contentId, appId, reason, note } = request.data;
    if (!contentId || !appId || !reason) {
        throw new HttpsError("invalid-argument", "Missing required report information.");
    }

    const db = admin.firestore();

    try {
        const contentRef = db.collection(`artifacts/${appId}/public/data/content_items`).doc(contentId);
        const reporterRef = db.collection("creators").doc(uid);
        const reportQuery = db.collection("reports")
            .where("reporterId", "==", uid)
            .where("contentId", "==", contentId)
            .limit(1);

        const [contentDoc, reporterDoc, existingReportSnapshot] = await Promise.all([
            contentRef.get(),
            reporterRef.get(),
            reportQuery.get()
        ]);

        if (!existingReportSnapshot.empty) {
            throw new HttpsError("already-exists", "You have already reported this content.");
        }
        if (!contentDoc.exists) {
            throw new HttpsError("not-found", "The content you are trying to report does not exist.");
        }
        if (!reporterDoc.exists) {
            throw new HttpsError("not-found", "Your user profile could not be found to submit this report.");
        }

        const contentData = contentDoc.data();
        const reporterData = reporterDoc.data();

        const contentTitle = contentData.title || "Untitled Content";
        const reportedUserId = contentData.creatorId || "unknown_creator_id";
        const reportedUserName = contentData.creatorName || "Unknown Creator";
        const reporterName = reporterData.creatorName || "Anonymous User";
        const reporterEmail = request.auth.token.email || 'N/A';

        const newReport = {
            reporterId: uid,
            reporterEmail: reporterEmail,
            reporterName: reporterName,
            contentId: contentId,
            contentTitle: contentTitle,
            reportedUserId: reportedUserId,
            reportedUserName: reportedUserName,
            reason: reason,
            note: note || '',
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("reports").add(newReport);

        return { success: true, message: "Your report has been submitted. Thank you." };

    } catch (error) {
        logger.error("FATAL ERROR in createContentReport", { 
            errorMessage: error.message, 
            errorCode: error.code, 
            requestData: request.data 
        });

        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "An unexpected error occurred while submitting your report.");
    }
});

exports.submitSuspensionAppeal = onCall(async (request) => {
    // THE FIX: Use the authenticated user's UID for a direct, reliable lookup.
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to submit an appeal.");
    }

    const { message } = request.data;
    if (!message) {
        throw new HttpsError("invalid-argument", "Missing appeal message.");
    }

    const db = admin.firestore();
    const userRef = db.collection("creators").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        throw new HttpsError("not-found", "Your user account could not be found.");
    }

    const userData = userDoc.data();

    if (!userData.suspendedUntil || userData.suspendedUntil.toDate() < new Date()) {
        throw new HttpsError("failed-precondition", "This account is not currently suspended.");
    }

    if (userData.hasPendingAppeal === true) {
        throw new HttpsError("already-exists", "You already have an appeal pending review.");
    }

    const batch = db.batch();
    const appealRef = db.collection("appeals").doc();
    batch.set(appealRef, {
        userId: userDoc.id,
        userName: userData.creatorName || 'N/A',
        userEmail: userData.email, // We still log the email for admin convenience
        message: message,
        status: 'pending',
        appealType: 'suspension',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    batch.update(userRef, { hasPendingAppeal: true });
    
    await batch.commit();

    return { success: true, message: "Your appeal has been submitted for review." };
});

exports.submitContentAppeal = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to appeal.");
    }

    const { contentId, message } = request.data;
    if (!contentId || !message || !message.trim()) {
        throw new HttpsError("invalid-argument", "Missing content ID or appeal message.");
    }

    const db = admin.firestore();
    const contentRef = db.collection(`artifacts/production-app-id/public/data/content_items`).doc(contentId);
    const appealQuery = db.collection("appeals").where("userId", "==", uid).where("contentId", "==", contentId).limit(1);

    try {
        const [contentDoc, userDoc, existingAppeal] = await Promise.all([
            contentRef.get(),
            db.collection("creators").doc(uid).get(),
            appealQuery.get()
        ]);

        if (!contentDoc.exists) {
            throw new HttpsError("not-found", "The content you are trying to appeal for does not exist.");
        }
        if (contentDoc.data().creatorId !== uid) {
            throw new HttpsError("permission-denied", "You can only appeal for your own content.");
        }
        if (!existingAppeal.empty) {
            throw new HttpsError("already-exists", "You have already submitted an appeal for this item.");
        }
        if (!userDoc.exists) {
            throw new HttpsError("not-found", "Your user profile could not be found.");
        }

        const userData = userDoc.data();
        const contentData = contentDoc.data();

        const newAppeal = {
            userId: uid,
            userName: userData.creatorName || 'N/A',
            userEmail: userData.email,
            message: message.trim(),
            status: 'pending',
            appealType: 'content', // <-- Critical for color-coding
            contentId: contentId,
            contentTitle: contentData.title,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("appeals").add(newAppeal);
        return { success: true, message: "Your appeal has been submitted for review." };

    } catch (error) {
        logger.error(`Error in submitContentAppeal for user '${uid}' and content '${contentId}':`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while submitting your appeal.");
    }
});

exports.dismissContentReports = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }
    const { reportIds } = request.data;
    if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
        throw new HttpsError("invalid-argument", "Missing report IDs.");
    }

    const db = admin.firestore();
    const batch = db.batch();
    const firstReportRef = db.collection("reports").doc(reportIds[0]);
    const firstReportDoc = await firstReportRef.get();

    if (!firstReportDoc.exists) {
        throw new HttpsError("not-found", "The initial report could not be found.");
    }
    const contentId = firstReportDoc.data().contentId;
    const contentRef = db.collection(`artifacts/production-app-id/public/data/content_items`).doc(contentId);

    batch.update(contentRef, { hasPendingReports: false });

    reportIds.forEach(id => {
        const reportRef = db.collection("reports").doc(id);
        batch.update(reportRef, { status: 'dismissed', resolvedBy: request.auth.uid, resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
    });

    await batch.commit();
    return { success: true, message: `Successfully dismissed ${reportIds.length} report(s).` };
});

exports.removeReportedContent = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }    const { contentId, appId, reportIds } = request.data;
    if (!contentId || !appId || !reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
        throw new HttpsError("invalid-argument", "Missing required information.");
    }

    const db = admin.firestore();
    const contentRef = db.collection(`artifacts/${appId}/public/data/content_items`).doc(contentId);
    const firstReportRef = db.collection("reports").doc(reportIds[0]);

    try {
        const [contentDoc, firstReportDoc] = await Promise.all([
            contentRef.get(),
            firstReportRef.get()
        ]);

        if (!contentDoc.exists) {
            throw new HttpsError("not-found", "The content to be removed does not exist.");
        }
        
        const contentData = contentDoc.data();
        const removalReason = firstReportDoc.exists ? firstReportDoc.data().reason : "Violation of Community Guidelines";
        const contentCreatorId = contentData.creatorId;

        // Perform all database writes in a single batch
        const batch = db.batch();

        // 1. Deactivate the content
        batch.update(contentRef, { isActive: false, hasPendingReports: false });

        // 2. Resolve all associated reports
        reportIds.forEach(id => {
            const reportRef = db.collection("reports").doc(id);
            batch.update(reportRef, { status: 'content_removed', resolvedBy: request.auth.uid, resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        
        // 3. Create the consolidated, appealable notification for the creator
        if (contentCreatorId) {
            const notificationRef = db.collection("notifications").doc();
            const notificationPayload = {
                userId: contentCreatorId,
                title: "Content Removed",
                body: `Your content "${contentData.title}" was removed. Reason: ${removalReason}.`,
                link: `/AppealContent/${contentId}`, // Special link for the frontend
                deliveryType: ["inbox", "push"],
                notificationType: "CONTENT_REMOVED",
                sound: true,
                isAppealable: true, // Preserving special functionality
                contentId: contentId, // Preserving special functionality
                isRead: false,
                status: "pending",
                timestamp: admin.firestore.FieldValue.serverTimestamp() // Corrected
            };
            batch.set(notificationRef, notificationPayload);

            // Badge Logic
            const creatorRef = db.collection("creators").doc(contentCreatorId);
            batch.update(creatorRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
        } else {
            logger.warn(`Content ${contentId} has no creatorId. Cannot send notification.`);
        }

        await batch.commit();
        
        return { success: true, message: "Content has been removed and the user has been notified." };

    } catch (error) {
        logger.error(`Error in removeReportedContent for content '${contentId}':`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred during content removal.");
    }
});

exports.suspendReportedUser = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }
    const { userId, durationHours, reportIds } = request.data;
    if (!userId || !durationHours || !reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
        throw new HttpsError("invalid-argument", "Missing user ID, duration, or report IDs.");
    }

    const db = admin.firestore();
    const batch = db.batch();
    
    const userRef = db.collection("creators").doc(userId);
    const suspensionEndDate = new Date();
    suspensionEndDate.setHours(suspensionEndDate.getHours() + parseInt(durationHours, 10));
    batch.update(userRef, { suspendedUntil: admin.firestore.Timestamp.fromDate(suspensionEndDate) });
    
    const firstReportRef = db.collection("reports").doc(reportIds[0]);
    const firstReportDoc = await firstReportRef.get();
    if (firstReportDoc.exists) {
        const contentId = firstReportDoc.data().contentId;
        const contentRef = db.collection(`artifacts/production-app-id/public/data/content_items`).doc(contentId);
        // Deactivates the violating content and clears the pending flag simultaneously
        batch.update(contentRef, { hasPendingReports: false, isActive: false });
    }

    reportIds.forEach(id => {
        const reportRef = db.collection("reports").doc(id);
        batch.update(reportRef, { status: 'user_suspended', resolvedBy: request.auth.uid, resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
    });

    await batch.commit();
    return { success: true, message: `User has been suspended for ${durationHours} hours.` };
});

exports.suspendUserDirectly = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }
    const { userId, durationHours } = request.data;
    if (!userId || !durationHours) {
        throw new HttpsError("invalid-argument", "Missing userId or durationHours.");
    }

    const db = admin.firestore();
    const userRef = db.collection("creators").doc(userId);
    
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        throw new HttpsError("not-found", "The target user does not exist.");
    }

    const targetUserRole = userDoc.data().role;
    const isCallerAdmin = request.auth.token.admin === true;
    const isCallerAuthority = request.auth.token.authority === true;

    // --- PERMISSION CHECKS ---
    if (isCallerAdmin && targetUserRole === 'admin') {
        throw new HttpsError('permission-denied', 'Admins cannot suspend other admins.');
    }
    if (isCallerAuthority && (targetUserRole === 'admin' || targetUserRole === 'authority')) {
        throw new HttpsError('permission-denied', 'Authorities cannot suspend other moderators or admins.');
    }

    const suspensionEndDate = new Date();
    suspensionEndDate.setHours(suspensionEndDate.getHours() + parseInt(durationHours, 10));

    await userRef.update({
        suspendedUntil: admin.firestore.Timestamp.fromDate(suspensionEndDate),
        hasPendingAppeal: false
    });

    logger.info(`Moderator '${request.auth.uid}' directly suspended user '${userId}' for ${durationHours} hours.`);
    return { success: true, message: `User has been suspended for ${durationHours} hours.` };
});

exports.reinstateUser = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }
    const { userId, appealId } = request.data;
    if (!userId || !appealId) {
        throw new HttpsError("invalid-argument", "Missing user or appeal ID.");
    }

    const db = admin.firestore();
    const batch = db.batch();

    const userRef = db.collection("creators").doc(userId);
    batch.update(userRef, { 
        suspendedUntil: admin.firestore.FieldValue.delete(),
        hasPendingAppeal: false 
    });

    const appealRef = db.collection("appeals").doc(appealId);
    batch.update(appealRef, { status: 'reinstated', resolvedBy: request.auth.uid, resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
    
    await batch.commit();
    return { success: true, message: "User has been reinstated." };
});

exports.dismissAppeal = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }
    const { userId, appealId } = request.data;
    if (!userId || !appealId) {
        throw new HttpsError("invalid-argument", "Missing user or appeal ID.");
    }

    const db = admin.firestore();
    const batch = db.batch();

    const userRef = db.collection("creators").doc(userId);
    batch.update(userRef, { hasPendingAppeal: false });

    const appealRef = db.collection("appeals").doc(appealId);
    batch.update(appealRef, { status: 'dismissed', resolvedBy: request.auth.uid, resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
    
    await batch.commit();
    return { success: true, message: "Appeal has been dismissed. The user's suspension remains." };
});

exports.toggleUserBanStatus = onCall(async (request) => {
    // 1. Authentication & Authorization Check
    const uid = request.auth.uid;
    if (!uid || (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin)) {
      throw new HttpsError('permission-denied', 'You must be a moderator to perform this action.');
    }
  
    const { targetUserId } = request.data;
    if (!targetUserId) {
      throw new HttpsError('invalid-argument', 'The function must be called with a "targetUserId" argument.');
    }
  
    const db = admin.firestore();
    const targetUserDocRef = db.collection('creators').doc(targetUserId);
  
    try {
      // 2. Perform the Action
      const targetUserDoc = await targetUserDocRef.get();
      if (!targetUserDoc.exists) {
        throw new HttpsError('not-found', 'The target user does not exist.');
      }

      const targetUserRole = targetUserDoc.data().role;
      const isCallerAdmin = request.auth.token.admin === true;
      const isCallerAuthority = request.auth.token.authority === true;

      // --- PERMISSION CHECKS ---
      if (isCallerAdmin && targetUserRole === 'admin') {
          throw new HttpsError('permission-denied', 'Admins cannot ban other admins.');
      }
      if (isCallerAuthority && (targetUserRole === 'admin' || targetUserRole === 'authority')) {
          throw new HttpsError('permission-denied', 'Authorities cannot ban other moderators or admins.');
      }
  
      const currentBanStatus = targetUserDoc.data().banned || false;
      const newBanStatus = !currentBanStatus;
  
      await targetUserDocRef.update({
        banned: newBanStatus
      });
  
      const actionText = newBanStatus ? 'banned' : 'unbanned';
      logger.info(`Moderator '${uid}' has ${actionText} user '${targetUserId}'.`);
      return { success: true, message: `Successfully ${actionText} user ${targetUserDoc.data().creatorName}.` };
  
    } catch (error) {
      logger.error("Error in toggleUserBanStatus:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'An unexpected error occurred.');
    }
});

exports.liftUserSuspension = onCall(async (request) => {
    // 1. Authentication & Authorization Check
    const uid = request.auth.uid;
    if (!uid || (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin)) {
      throw new HttpsError('permission-denied', 'You must be a moderator to perform this action.');
    }  
    const { targetUserId } = request.data;
    if (!targetUserId) {
      throw new HttpsError('invalid-argument', 'The function must be called with a "targetUserId" argument.');
    }
  
    const db = admin.firestore();
    const targetUserDocRef = db.collection('creators').doc(targetUserId);
  
    try {
      // 2. Perform the Action
      const targetUserDoc = await targetUserDocRef.get();
      if (!targetUserDoc.exists) {
        throw new HttpsError('not-found', 'The target user does not exist.');
      }

      const targetUserRole = targetUserDoc.data().role;
      const isCallerAdmin = request.auth.token.admin === true;
      const isCallerAuthority = request.auth.token.authority === true;

      // --- PERMISSION CHECKS ---
      if (isCallerAdmin && targetUserRole === 'admin') {
          throw new HttpsError('permission-denied', 'Admins cannot lift suspensions for other admins.');
      }
      if (isCallerAuthority && (targetUserRole === 'admin' || targetUserRole === 'authority')) {
          throw new HttpsError('permission-denied', 'Authorities cannot lift suspensions for other moderators or admins.');
      }
  
      await targetUserDocRef.update({
        suspendedUntil: admin.firestore.FieldValue.delete()
      });
  
      logger.info(`Moderator '${uid}' has lifted the suspension for user '${targetUserId}'.`);
      return { success: true, message: `Suspension successfully lifted for user ${targetUserDoc.data().creatorName}.` };
  
    } catch (error) {
      logger.error("Error in liftUserSuspension:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'An unexpected error occurred.');
    }
});

exports.createOpportunity = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to post a casting call.");
    }
    const uid = request.auth.uid;

    // Secure Gating: Only Admins or Authorities can create casting calls
    if (request.auth.token.admin !== true && request.auth.token.authority !== true && request.auth.token.super_admin !== true) {
        throw new HttpsError("permission-denied", "Only administrators can post casting calls.");
    }
    const data = request.data || {};
    const requiredFields = ['title', 'providerName', 'opportunityType', 'compensationType', 'equipmentProvided', 'location', 'description', 'howToApply', 'listingDuration'];
    for (const field of requiredFields) {
        if (!data[field]) {
            throw new HttpsError("invalid-argument", `Missing required field: ${field}`);
        }
    }

    logger.info(`Admin '${uid}' is creating casting call: "${data.title}"`);
    const db = admin.firestore();
    
    const createdAt = admin.firestore.FieldValue.serverTimestamp();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(data.listingDuration, 10));

    const newOpportunity = {
        ...data,
        postedByUid: uid,
        status: 'active', // Admin posts go live immediately without review!
        createdAt: createdAt,
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        viewCount: 0,
        applyClickCount: 0,
        listingTier: 'standard'
    };
    
    const newDocRef = await db.collection("opportunities").add(newOpportunity);
    logger.info(`Successfully created live casting call with ID '${newDocRef.id}'.`);

    return { success: true, message: "Casting Call posted successfully!", opportunityId: newDocRef.id };
});

exports.approveOpportunity = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }
    const { opportunityId } = request.data;
    if (!opportunityId) {
        throw new HttpsError("invalid-argument", "Missing opportunityId.");
    }

    const db = admin.firestore();
    const opportunityRef = db.collection("opportunities").doc(opportunityId);
    
    const opportunityDoc = await opportunityRef.get();
    if (!opportunityDoc.exists) {
        throw new HttpsError("not-found", "Opportunity not found.");
    }

    // Update the opportunity status first.
    await opportunityRef.update({ status: 'active' });

    const opportunityData = opportunityDoc.data();
    const posterId = opportunityData.postedByUid;

    if (posterId) {
        const posterRef = db.collection("creators").doc(posterId);
        const notificationPayload = {
            userId: posterId,
            title: "Opportunity Approved!",
            body: `Congratulations! Your opportunity "${opportunityData.title}" is now live.`,
            link: "/MyListings",
            deliveryType: ["inbox", "push"],
            notificationType: "OPPORTUNITY_APPROVED",
            sound: true,
            isRead: false,
            status: "pending",
            timestamp: admin.firestore.FieldValue.serverTimestamp() // Corrected
        };

        await db.collection("notifications").add(notificationPayload);
        await posterRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
    }

    return { success: true, message: "Opportunity approved and is now live." };
});

exports.rejectOpportunity = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }
    const { opportunityId } = request.data;
    if (!opportunityId) {
        throw new HttpsError("invalid-argument", "Missing opportunityId.");
    }

    const db = admin.firestore();
    const opportunityRef = db.collection("opportunities").doc(opportunityId);

    const opportunityDoc = await opportunityRef.get();
    if (!opportunityDoc.exists) {
        throw new HttpsError("not-found", "Opportunity not found.");
    }

    await opportunityRef.update({ status: 'rejected' });

    const posterId = opportunityDoc.data().postedByUid;
    if (posterId) {
        const posterRef = db.collection("creators").doc(posterId);
        const notificationPayload = {
            userId: posterId,
            title: "Opportunity Update",
            body: `Your opportunity "${opportunityDoc.data().title}" was not approved.`,
            link: "/MyListings",
            deliveryType: ["inbox"], // This does not send a push, only an inbox message.
            notificationType: "OPPORTUNITY_REJECTED",
            sound: false,
            isRead: false,
            status: "pending",
            timestamp: admin.firestore.FieldValue.serverTimestamp() // Corrected
        };
        await db.collection("notifications").add(notificationPayload);
        // Note: We do not increment the badge count for rejections, preserving original behavior.
    }

    return { success: true, message: "Opportunity rejected. The user has been notified." };
});

exports.endOpportunityByAdmin = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }
    const { opportunityId } = request.data;
    if (!opportunityId) {
        throw new HttpsError("invalid-argument", "Missing opportunityId.");
    }

    const db = admin.firestore();
    const opportunityRef = db.collection("opportunities").doc(opportunityId);
    
    const opportunityDoc = await opportunityRef.get();
    if (!opportunityDoc.exists) {
        throw new HttpsError("not-found", "Opportunity not found.");
    }

    const opportunityData = opportunityDoc.data();
    if (opportunityData.status !== 'active') {
        throw new HttpsError("failed-precondition", "This listing is not currently active.");
    }

    // Update the opportunity status first.
    await opportunityRef.update({ status: 'expired' });

    const posterId = opportunityData.postedByUid;
    if (posterId) {
        const posterRef = db.collection("creators").doc(posterId);
        const notificationPayload = {
            userId: posterId,
            title: "Listing Update",
            body: `Your opportunity "${opportunityData.title}" was ended by a moderator.`,
            link: "/MyListings",
            deliveryType: ["inbox", "push"],
            notificationType: "OPPORTUNITY_ENDED_BY_ADMIN",
            sound: true,
            isRead: false,
            status: "pending",
            timestamp: admin.firestore.FieldValue.serverTimestamp() // Corrected
        };

        await db.collection("notifications").add(notificationPayload);
        await posterRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
    }

    return { success: true, message: "Opportunity has been manually ended." };
});

exports.deleteOpportunity = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const { opportunityId } = request.data;
    if (!opportunityId) {
        throw new HttpsError("invalid-argument", "Missing opportunityId.");
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const opportunityRef = db.collection("opportunities").doc(opportunityId);
    
    const opportunityDoc = await opportunityRef.get();
    if (!opportunityDoc.exists) {
        throw new HttpsError("not-found", "The listing you are trying to delete does not exist.");
    }

    const opData = opportunityDoc.data();
    if (opData.postedByUid !== uid && request.auth.token.admin !== true) {
        throw new HttpsError("permission-denied", "You do not have permission to delete this listing.");
    }

    // 1. Purge GCS Flyer assets to prevent storage bloat [1]
    if (opData.flyerImageUrl) {
        const path = getPathFromUrl(opData.flyerImageUrl);
        if (path) await bucket.file(path).delete().catch(() => {});
    }

    // 2. Erase from creators' saved lists globally to prevent ghost references
    const savedQuery = db.collectionGroup("savedOpportunities").where("__name__", "==", opportunityId);
    const savedSnap = await savedQuery.get();
    if (!savedSnap.empty) {
        const batch = db.batch();
        savedSnap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }

    await opportunityRef.delete();

    return { success: true, message: "Opportunity successfully deleted." };
});

exports.closeOpportunityListing = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const { opportunityId } = request.data;
    if (!opportunityId) {
        throw new HttpsError("invalid-argument", "Missing opportunityId.");
    }

    const db = admin.firestore();
    const opportunityRef = db.collection("opportunities").doc(opportunityId);
    
    const opportunityDoc = await opportunityRef.get();
    if (!opportunityDoc.exists) {
        throw new HttpsError("not-found", "The listing you are trying to close does not exist.");
    }
    
    if (opportunityDoc.data().postedByUid !== uid) {
        throw new HttpsError("permission-denied", "You do not have permission to close this listing.");
    }

    if (opportunityDoc.data().status !== 'active') {
        throw new HttpsError("failed-precondition", "This listing is not currently active.");
    }

    await opportunityRef.update({ status: 'expired' });

    return { success: true, message: "Your listing has been closed." };
});

    exports.updateOpportunityDetails = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to update a listing.");
    }

    const { opportunityId, updates } = request.data;
    if (!opportunityId || !updates) {
        throw new HttpsError("invalid-argument", "Missing opportunityId or update data.");
    }

    const db = admin.firestore();
    const opportunityRef = db.collection("opportunities").doc(opportunityId);

    try {
        const opportunityDoc = await opportunityRef.get();
        if (!opportunityDoc.exists) {
            throw new HttpsError("not-found", "The opportunity you are trying to edit does not exist.");
        }

        const opportunityData = opportunityDoc.data();
        if (opportunityData.postedByUid !== uid) {
            throw new HttpsError("permission-denied", "You do not have permission to edit this listing.");
        }

        // Sanitize updates to only allow specific, non-destructive fields.
        const allowedUpdates = {};
        if (updates.title !== undefined) allowedUpdates.title = updates.title;
        if (updates.providerName !== undefined) allowedUpdates.providerName = updates.providerName;
        if (updates.opportunityType !== undefined) allowedUpdates.opportunityType = updates.opportunityType;
        if (updates.compensationType !== undefined) allowedUpdates.compensationType = updates.compensationType;
        if (updates.equipmentProvided !== undefined) allowedUpdates.equipmentProvided = updates.equipmentProvided;
        if (updates.location !== undefined) allowedUpdates.location = updates.location;
        if (updates.description !== undefined) allowedUpdates.description = updates.description;
        if (updates.howToApply !== undefined) allowedUpdates.howToApply = updates.howToApply;
        if (updates.flyerImageUrl !== undefined) allowedUpdates.flyerImageUrl = updates.flyerImageUrl;
        // Fields like status, postedByUid, createdAt, etc., are intentionally ignored.

        if (Object.keys(allowedUpdates).length === 0) {
            return { success: true, message: "No valid fields were provided to update." };
        }

        await opportunityRef.update(allowedUpdates);

        logger.info(`User '${uid}' successfully updated details for opportunity '${opportunityId}'.`);
        return { success: true, message: "Opportunity details updated successfully." };

    } catch (error) {
        logger.error(`Error updating opportunity '${opportunityId}' for user '${uid}'`, { error });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while updating the listing.");
    }
});

exports.incrementOpportunityView = onCall(async (request) => {
    const { opportunityId } = request.data;
    if (!opportunityId) {
        throw new HttpsError("invalid-argument", "Missing opportunityId.");
    }
    const db = admin.firestore();
    const opportunityRef = db.collection("opportunities").doc(opportunityId);
    
    return opportunityRef.update({ viewCount: admin.firestore.FieldValue.increment(1) });
});

exports.incrementOpportunityApplyClick = onCall(async (request) => {
    const { opportunityId } = request.data;
    if (!opportunityId) {
        throw new HttpsError("invalid-argument", "Missing opportunityId.");
    }
    const db = admin.firestore();
    const opportunityRef = db.collection("opportunities").doc(opportunityId);

    return opportunityRef.update({ applyClickCount: admin.firestore.FieldValue.increment(1) });
});

exports.checkOpportunityExpirations = onSchedule("every 12 hours", async (event) => {
    logger.info("Running scheduled job: Checking for expired opportunities...");
    const db = admin.firestore();
    const now = new Date();

    // Query for active listings where the expiration date has passed
    const expiredQuery = db.collection("opportunities")
        .where("status", "==", "active")
        .where("expiresAt", "<=", now);
        
    // Query for old, expired listings that need to be deleted
    const fiveDaysAgo = new Date(now.getTime() - (5 * 24 * 60 * 60 * 1000));
    const toDeleteQuery = db.collection("opportunities")
        .where("status", "==", "expired")
        .where("expiresAt", "<", fiveDaysAgo);

    try {
        const [expiredSnapshot, toDeleteSnapshot] = await Promise.all([
            expiredQuery.get(),
            toDeleteQuery.get()
        ]);
        
        const batch = db.batch();
        let expiredCount = 0;
        let deletedCount = 0;

        if (!expiredSnapshot.empty) {
            expiredSnapshot.forEach(doc => {
                batch.update(doc.ref, { status: 'expired' });
                expiredCount++;
            });
        }
        
        if (!toDeleteSnapshot.empty) {
            toDeleteSnapshot.forEach(doc => {
                batch.delete(doc.ref);
                deletedCount++;
            });
        }

        if (expiredCount > 0 || deletedCount > 0) {
            await batch.commit();
            logger.info(`Opportunity cleanup complete. Marked ${expiredCount} as expired. Permanently deleted ${deletedCount} old listings.`);
        } else {
            logger.info("No opportunities to expire or delete at this time.");
        }
        
        return null;

    } catch (error) {
        logger.error("Error during opportunity expiration job:", { error });
        return null;
    }
});

exports.createCompetition = onCall(async (request) => {
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
      throw new HttpsError("permission-denied", "You must be an admin to create a competition.");
    }
    
    // THE FIX: The data is now the request.data object itself, not nested.
    const competitionData = request.data;
    if (!competitionData || !competitionData.title) {
        throw new HttpsError("invalid-argument", "Missing competition data or title.");
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    logger.info(`Admin '${request.auth.uid}' is saving single-slot competition: "${competitionData.title}"`);
    
    try {
        // Enforce Static Single-Slot ID to prevent orphan drift and directory clutter [1]
        const competitionRef = db.collection("competitions").doc("active_competition");
        
        const finalData = { ...competitionData };

        if (finalData.entryDeadline) {
            finalData.entryDeadline = admin.firestore.Timestamp.fromDate(new Date(finalData.entryDeadline));
        }
        if (finalData.competitionEnd) {
            finalData.competitionEnd = admin.firestore.Timestamp.fromDate(new Date(finalData.competitionEnd));
        }

        await competitionRef.set({
            ...finalData,
            status: 'Pending',
            createdAt: FieldValue.serverTimestamp(),
            createdBy: request.auth.uid,
            entryCount: 0
        });

        logger.info(`Successfully created competition with ID: ${competitionRef.id}`);
        return { success: true, message: "Competition saved as a draft successfully.", competitionId: competitionRef.id };

    } catch (error) {
        logger.error("Error creating competition document:", error);
        throw new HttpsError("internal", "An unexpected error occurred while creating the competition.");
    }
});

exports.updateCompetition = onCall(async (request) => {
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
      throw new HttpsError("permission-denied", "You must be an admin to update a competition.");
    }

    const { competitionId, updates } = request.data;
    if (!competitionId || !updates) {
        throw new HttpsError("invalid-argument", "Missing competitionId or update data.");
    }
    
    const db = admin.firestore();
    const competitionRef = db.collection("competitions").doc(competitionId);
    
    // Sanitize updates to only allow specific fields to be changed
    const allowedUpdates = {};
    if (updates.title !== undefined) allowedUpdates.title = updates.title;
    if (updates.description !== undefined) allowedUpdates.description = updates.description;
    if (updates.rules !== undefined) allowedUpdates.rules = updates.rules;
    if (updates.prizesText !== undefined) allowedUpdates.prizesText = updates.prizesText;
    if (updates.flyerLinkUrl !== undefined) allowedUpdates.flyerLinkUrl = updates.flyerLinkUrl;
    if (updates.status) allowedUpdates.status = updates.status;
    if (updates.noticeText !== undefined) allowedUpdates.noticeText = updates.noticeText;

    // --- SURGICAL FIX: ADD THIS LINE ---
    if (updates.winnersToNotify !== undefined) allowedUpdates.winnersToNotify = updates.winnersToNotify;

    // Convert date strings from the form back into Firestore Timestamps
    if (updates.entryDeadline !== undefined) {
        allowedUpdates.entryDeadline = updates.entryDeadline ? admin.firestore.Timestamp.fromDate(new Date(updates.entryDeadline)) : null;
    }
    if (updates.competitionEnd !== undefined) {
        allowedUpdates.competitionEnd = updates.competitionEnd ? admin.firestore.Timestamp.fromDate(new Date(updates.competitionEnd)) : null;
    }
    if (updates.resultsRevealTime !== undefined) {
        allowedUpdates.resultsRevealTime = updates.resultsRevealTime ? admin.firestore.Timestamp.fromDate(new Date(updates.resultsRevealTime)) : null;
    }
    
    // This is a safety check to prevent an admin from starting a new competition if another one is already active.
    if (allowedUpdates.status === 'Accepting Entries') {
        const liveQuery = db.collection("competitions").where("status", "in", ["Accepting Entries", "Live Voting"]);
        const liveSnapshot = await liveQuery.get();
        
        let anotherLiveExists = false;
        liveSnapshot.forEach(doc => {
            if (doc.id !== competitionId) {
                anotherLiveExists = true;
            }
        });
        if (anotherLiveExists) {
            throw new HttpsError("failed-precondition", "Another competition is already live. Please end it before starting a new one.");
        }
    }
    
    await competitionRef.update({
        ...allowedUpdates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true, message: "Competition updated successfully." };
});

exports.submitCompetitionEntry = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to enter a competition.");
    }

    // THE FIX: The data is now the request.data object itself, not nested.
    const entryData = request.data;
    const { competitionId, contactNumber } = entryData;

    if (!competitionId || !contactNumber) {
        throw new HttpsError("invalid-argument", "Missing competition ID or contact number.");
    }

    const db = admin.firestore();
    logger.info(`User '${uid}' is submitting an entry to competition '${competitionId}'.`);

    return db.runTransaction(async (transaction) => {
        const creatorRef = db.collection("creators").doc(uid);
        const competitionRef = db.collection("competitions").doc(competitionId);
        
        const creatorDoc = await transaction.get(creatorRef);
        const competitionDoc = await transaction.get(competitionRef);

        if (!creatorDoc.exists) {
            throw new HttpsError("not-found", "Your user profile could not be found.");
        }
        if (!competitionDoc.exists) {
            throw new HttpsError("not-found", "The competition you are trying to enter does not exist.");
        }

        const creatorData = creatorDoc.data();
        const competitionData = competitionDoc.data();

        if (competitionData.status !== 'Accepting Entries') {
            throw new HttpsError("failed-precondition", "This competition is not currently accepting entries.");
        }
         // With the frontend now sending correct data, this check is simplified and hardened.
        // It operates purely on server-authoritative Timestamps.
        if (competitionData.entryDeadline && competitionData.entryDeadline.toMillis() < Date.now()) {
            throw new HttpsError("failed-precondition", "The entry deadline for this competition has passed.");
        }

        // --- THE FIX: SECURE EARNINGS DEDUCTION & POOL ROUTING (With 15% Platform Fee Cut) ---
        const entryFee = competitionData.entryFee || 0;
        let poolIncrement = 0;

        if (entryData.paymentMethod === 'earnings' && entryFee > 0) {
            const currentEarnings = creatorData.totalEarnings || 0;
            if (currentEarnings < entryFee) {
                throw new HttpsError("failed-precondition", "Insufficient earnings to cover the tournament entry fee.");
            }
            // Securely deduct the full entry fee from the contestant's dashboard balance
            transaction.update(creatorRef, {
                totalEarnings: FieldValue.increment(-entryFee)
            });
            // Stage exactly 85% of the entry fee to be added to the tournament prize pool, reserving your 15% fee
            poolIncrement = Math.round((entryFee * 0.85) * 100) / 100;
        }

        const entryRef = competitionRef.collection("entries").doc(uid);

// Explicitly construct the entry document from the received data.
// This prevents unwanted fields and ensures all required fields are saved.
transaction.set(entryRef, {
    // Core data from the user's submission
    competitionId: entryData.competitionId,
    title: entryData.title || '',
    contactNumber: entryData.contactNumber,
    bio: entryData.bio || '',
    submissionUrl: entryData.submissionUrl || '',
    photoUrl: entryData.photoUrl || '',
    customThumbnailUrl: entryData.customThumbnailUrl || '',
    status: entryData.status || 'active', // Saves pending/active status dynamically

    // Server-added authoritative data
    userId: uid,
    userName: creatorData.creatorName || creatorData.email,
    userProfilePicture: creatorData.profilePictureUrl || '',
    createdAt: FieldValue.serverTimestamp(),
    likeCount: 0,
    viewCount: 0
});

        // THE FIX: Route the staged funds into the tournament's live prize pool
        const compUpdates = {
            entryCount: FieldValue.increment(1)
        };
        if (poolIncrement > 0) {
            compUpdates.prizePool = FieldValue.increment(poolIncrement);
        }
        
        transaction.update(competitionRef, compUpdates);

        return { success: true, message: "Your entry has been submitted successfully!" };
    });
});

exports.incrementCompetitionLike = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to like content.");
    }
    const { competitionId, entryId, isLiking } = request.data;
    if (!competitionId || !entryId || typeof isLiking !== 'boolean') {
        throw new HttpsError("invalid-argument", "Missing required information.");
    }

    const db = admin.firestore();
    const entryRef = db.collection("competitions").doc(competitionId).collection("entries").doc(entryId);
    const likeRef = entryRef.collection("likes").doc(uid);
    const increment = isLiking ? 1 : -1;

    return db.runTransaction(async (transaction) => {
        const entryDoc = await transaction.get(entryRef);
        if (!entryDoc.exists) {
            throw new HttpsError("not-found", "This competition entry does not exist.");
        }
        if (isLiking) {
            transaction.set(likeRef, { likedAt: new Date() });
        } else {
            transaction.delete(likeRef);
        }
        transaction.update(entryRef, { likeCount: admin.firestore.FieldValue.increment(increment) });
    });
});

exports.incrementCompetitionView = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to have your view counted.");
    }
    const { competitionId, entryId } = request.data;
    if (!competitionId || !entryId) {
        throw new HttpsError("invalid-argument", "Missing required information.");
    }

    const db = admin.firestore();
    const entryRef = db.collection("competitions").doc(competitionId).collection("entries").doc(entryId);
    
    return db.runTransaction(async (transaction) => {
        const entryDoc = await transaction.get(entryRef);
        if (!entryDoc.exists) {
            throw new HttpsError("not-found", "The entry you are viewing does not exist.");
        }

        if (entryDoc.data().userId === uid) {
            logger.info(`User '${uid}' viewed their own entry. View not counted.`);
            return { message: "Cannot count view on your own entry." };
        }
        
        transaction.update(entryRef, { viewCount: admin.firestore.FieldValue.increment(1) });
    });
});

exports.checkResultsRevelations =onSchedule("every 12 hours", async (event) => {
    const db = admin.firestore();
    const now = new Date();

    const competitionsToRevealQuery = db.collection("competitions")
        .where("status", "==", "Judging")
        .where("resultsRevealTime", "<=", now);

    try {
        const snapshot = await competitionsToRevealQuery.get();
        // SILENT EXIT: If there's nothing to do, exit without logging.
        if (snapshot.empty) return null;

        // LOGS ONLY WHEN WORK IS FOUND:
        logger.info(`Found ${snapshot.size} competition(s) ready for results revelation. Processing...`);

        for (const doc of snapshot.docs) {
            const competitionData = doc.data();
            const competitionRef = doc.ref;
            
            logger.info(`Competition '${doc.id}' timer has expired. Setting status to 'Results Visible'.`);
            
            const batch = db.batch();
            batch.update(competitionRef, { status: "Results Visible" });

            const broadcast = {
                broadcastType: "COMPETITION_RESULTS",
                message: `The results for the competition "${competitionData.title}" are in! See who won.`,
                link: "/CompetitionScreen",
                timestamp: new Date()
            };
            batch.set(db.collection("broadcast_notifications").doc(), broadcast);

            // THE AUDIT FIX: Default to 3 winners if the admin forgot to select a setting during draft creation
            const winnersToNotify = (competitionData.winnersToNotify !== undefined && competitionData.winnersToNotify !== null) ? competitionData.winnersToNotify : 3;
            if (winnersToNotify > 0) {
                try {
                    const entriesQuery = competitionRef.collection("entries").orderBy("likeCount", "desc").limit(winnersToNotify);
                    const winnersSnapshot = await entriesQuery.get();

                    if (!winnersSnapshot.empty) {
                        let rank = 1;
                        winnersSnapshot.forEach(winnerDoc => {
                            const winnerData = winnerDoc.data();
                            const winnerId = winnerData.userId;
                            if (!winnerId) return;

                            let rankString = (rank === 1) ? "1st" : (rank === 2) ? "2nd" : (rank === 3) ? "3rd" : `${rank}th`;
                            
                            const notificationPayload = {
                                userId: winnerId,
                                title: "You Won!",
                                body: `Congratulations! You won ${rankString} place in the "${competitionData.title}" competition!`,
                                link: "/CompetitionScreen",
                                deliveryType: ["inbox", "push"],
                                notificationType: "COMPETITION_WINNER",
                                sound: true,
                                isRead: false,
                                status: "pending",
                                timestamp: admin.firestore.FieldValue.serverTimestamp() // Corrected
                            };
                            
                            batch.set(db.collection("notifications").doc(), notificationPayload);
                            const winnerRef = db.collection("creators").doc(winnerId);
                            batch.update(winnerRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
                            
                            rank++;
                        });
                    }
                } catch (queryError) {
                    logger.error(`CRITICAL FAILURE: Could not query winners for competition '${doc.id}'. This is likely a missing index. See details:`, queryError);
                }
            }
            
            await batch.commit();
        }

        logger.info(`Successfully processed and revealed results for ${snapshot.size} competitions.`);
        return null;

    } catch (error) {
        logger.error("Error during scheduled results revelation check", { error });
        return null;
    }
});

exports.deleteCompetition = onCall(async (request) => {
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
      throw new HttpsError("permission-denied", "You must be an admin to delete a competition.");
    }
    const { competitionId } = request.data;
    if (!competitionId) {
        throw new HttpsError("invalid-argument", "Missing competitionId.");
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const competitionRef = db.collection("competitions").doc(competitionId);
    logger.info(`Admin '${request.auth.uid}' initiated recursive deletion for competition: '${competitionId}'.`);

    const getPathFromUrl = (url) => {
        if (!url || !url.startsWith('https://firebasestorage.googleapis.com')) return null;
        try {
            const decodedUrl = decodeURIComponent(url);
            return decodedUrl.split('/o/')[1].split('?')[0];
        } catch (e) {
            logger.warn(`Could not parse URL for deletion: ${url}`, e);
            return null;
        }
    };
    
    async function deleteCollection(collectionRef, batchSize) {
        const query = collectionRef.orderBy('__name__').limit(batchSize);
        return new Promise((resolve, reject) => {
            deleteQueryBatch(query, resolve).catch(reject);
        });
    }

    async function deleteQueryBatch(query, resolve) {
        const snapshot = await query.get();
        if (snapshot.size === 0) {
            resolve();
            return;
        }

        const batch = db.batch();
        for (const doc of snapshot.docs) {
            if (doc.data().photoUrl) {
                const photoPath = getPathFromUrl(doc.data().photoUrl);
                if (photoPath) await bucket.file(photoPath).delete().catch(e => logger.error(`Non-fatal: Failed to delete entry photo: ${photoPath}`, e));
            }
            const subcollections = await doc.ref.listCollections();
            for (const subcollection of subcollections) {
                await deleteCollection(subcollection, 100);
            }
            batch.delete(doc.ref);
        }
        await batch.commit();

        process.nextTick(() => { deleteQueryBatch(query, resolve); });
    }
    
    try {
        const competitionDoc = await competitionRef.get();
        if (competitionDoc.exists) {
            const compData = competitionDoc.data();
            
            // 1. Delete standard flyer thumbnail
            const flyerPath = getPathFromUrl(compData.flyerImageUrl);
            if (flyerPath) {
                await bucket.file(flyerPath).delete().catch(e => logger.error(`Non-fatal: Failed to delete main flyer: ${flyerPath}`, e));
            }

            // 2. THE FIX: Also delete high-resolution flyer to prevent permanent Cloud Storage leaks
            const highResPath = getPathFromUrl(compData.flyerImageUrl_highRes);
            if (highResPath) {
                await bucket.file(highResPath).delete().catch(e => logger.error(`Non-fatal: Failed to delete high-res flyer: ${highResPath}`, e));
            }
        } else {
             logger.warn(`Competition document '${competitionId}' already deleted. Aborting.`);
             return { success: true, message: "Competition already deleted." };
        }

        const entriesRef = competitionRef.collection("entries");
        await deleteCollection(entriesRef, 100);

        await competitionRef.delete();

        logger.info(`Successfully deleted competition '${competitionId}'.`);
        return { success: true, message: "Competition and all associated data have been permanently deleted." };

    } catch (error) {
        logger.error(`Error during recursive deletion for '${competitionId}':`, error);
        throw new HttpsError("internal", "An error occurred during the deletion process.", error.message);
    }
});

exports.checkCompetitionStatusTransitions =onSchedule("every 12 hours", async (event) => {
    logger.info("Running scheduled job: Checking for competition status transitions...");
    const db = admin.firestore();
    const now = new Date();

    const activeCompetitionsQuery = db.collection("competitions")
        .where("status", "in", ["Accepting Entries", "Live Voting"]);

    try {
        const snapshot = await activeCompetitionsQuery.get();

        if (snapshot.empty) {
            logger.info("No competitions in an active state. No transitions needed.");
            return null;
        }

        const batch = db.batch();
        let transitionsMade = 0;

        snapshot.forEach(doc => {
            const competition = doc.data();
            const competitionId = doc.id;

            if (competition.status === "Accepting Entries" && competition.entryDeadline) {
                if (competition.entryDeadline.toDate() < now) {
                    logger.info(`Competition '${competitionId}' entry deadline has passed. Transitioning to 'Live Voting'.`);
                    batch.update(doc.ref, { status: "Live Voting" });
                    const broadcast = {
                        broadcastType: "COMPETITION_UPDATE",
                        message: `Entries are closed for "${competition.title}". Public voting is now open!`,
                        link: "/CompetitionScreen",
                        timestamp: new Date()
                    };
                    batch.set(db.collection("broadcast_notifications").doc(), broadcast);
                    transitionsMade++;
                }
            }

            if (competition.status === "Live Voting" && competition.competitionEnd) {
                 if (competition.competitionEnd.toDate() < now) {
                    logger.info(`Competition '${competitionId}' voting period has ended. Transitioning to 'Judging'.`);
                    batch.update(doc.ref, { status: "Judging" });
                    const broadcast = {
                        broadcastType: "COMPETITION_UPDATE",
                        message: `Voting has now closed for the competition: "${competition.title}". Results are coming soon!`,
                        link: "/CompetitionScreen",
                        timestamp: new Date()
                    };
                    batch.set(db.collection("broadcast_notifications").doc(), broadcast);
                    transitionsMade++;
                }
            }
        });

        if (transitionsMade > 0) {
            await batch.commit();
            logger.info(`Successfully transitioned and notified for ${transitionsMade} competitions.`);
        } else {
            logger.info("Checked active competitions, but no deadlines have passed yet.");
        }
        
        return null;

    } catch (error) {
        logger.error("Error during scheduled competition status transition check", { error });
        return null;
    }
});

        // =====================================================================
// =========== START: SERVER-AUTHORITATIVE COMPETITION TIMER ===========
// =====================================================================
exports.updateCompetitionDisplayState =onSchedule("every 12 hours", async (event) => {
    logger.info("Running scheduled job: updateCompetitionDisplayState.");
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const displayStateRef = db.collection("settings").doc("competitionDisplayState");

    try {
        const activeQuery = db.collection("competitions")
            .where("status", "in", ["Accepting Entries", "Live Voting", "Judging", "Results Visible"])
            .orderBy("createdAt", "desc")
            .limit(1);
        
        const snapshot = await activeQuery.get();

        if (snapshot.empty) {
            await displayStateRef.set({ isActive: false, status: 'no_active_competition' }, { merge: true });
            return null;
        }

        const competitionDoc = snapshot.docs[0];
        const competitionData = competitionDoc.data();
        const nowMs = now.toMillis();

        let displayMessage = "";
        let countdownTarget = null;
        const status = competitionData.status;

        if (status === 'Accepting Entries') {
            const deadlineMs = competitionData.entryDeadline?.toMillis();
            if (deadlineMs && nowMs < deadlineMs) {
                displayMessage = "Entries close in";
                countdownTarget = competitionData.entryDeadline;
            } else {
                displayMessage = "Entries are closed";
            }
        } else if (status === 'Live Voting') {
            const deadlineMs = competitionData.competitionEnd?.toMillis();
            if (deadlineMs && nowMs < deadlineMs) {
                displayMessage = "Voting ends in";
                countdownTarget = competitionData.competitionEnd;
            } else {
                displayMessage = "Voting has ended";
            }
        } else if (status === 'Judging') {
            displayMessage = "Judging in Progress";
        } else if (status === 'Results Visible') {
            displayMessage = "Results Are In!";
        }

        const displayState = {
            isActive: true,
            competitionId: competitionDoc.id,
            title: competitionData.title,
            status: status,
            displayMessage: displayMessage,
            countdownTarget: countdownTarget
        };

        await displayStateRef.set(displayState, { merge: true });
        logger.info(`Updated competitionDisplayState for '${competitionData.title}' to status '${status}'.`);

    } catch (error) {
        logger.error("Error in updateCompetitionDisplayState scheduled job:", { error });
        await displayStateRef.set({ isActive: false, status: 'error' }, { merge: true }); 
    }
    return null;
});
// =====================================================================
// ============= END: SERVER-AUTHORITATIVE COMPETITION TIMER =============
// =====================================================================

        // =====================================================================
// ============ START: AUTOMATED EVENT LIFECYCLE SYSTEM ================
// =====================================================================

// Reusable core logic for the Status Manager
async function runManageEventStatus() {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    
     // This is the new, simplified logic.
    let liveTransitions = 0;
    let completedTransitions = 0;
    const batch = db.batch();

    // Find all "upcoming" events whose scheduled start time is now or in the past.
    // This is the most direct and reliable way to check.
    const eventsToStartQuery = db.collection("events")
        .where("status", "==", "upcoming")
        .where("scheduledStartTime", "<=", now);

    const toStartSnapshot = await eventsToStartQuery.get();
    toStartSnapshot.forEach(doc => {
        batch.update(doc.ref, { status: "live" });
        liveTransitions++;
        // Create a broadcast notification when an event goes live
        const eventData = doc.data();
        const broadcast = {
            broadcastType: "EVENT_LIVE",
            message: `The live event "${eventData.eventTitle}" is starting now!`,
            link: "/Discover",
            timestamp: new Date()
        };
        batch.set(db.collection("broadcast_notifications").doc(), broadcast);
    });

    // The logic for ending events remains the same, as it is not time-critical.
    const eventsToEndQuery = db.collection("events").where("status", "==", "live").where("scheduledEndTime", "<=", now);
    const toEndSnapshot = await eventsToEndQuery.get();
    toEndSnapshot.forEach(doc => {
        batch.update(doc.ref, { status: "completed" });
        completedTransitions++;
    });

    if (liveTransitions > 0 || completedTransitions > 0) {
        await batch.commit();
    }
    const message = `Status Manager complete. Made ${liveTransitions} event(s) live and ${completedTransitions} event(s) completed.`;
    logger.info(message);
    return message;
}

// The scheduled function now simply calls our reusable logic.
exports.manageEventStatus =onSchedule("every 12 hours", async (event) => {
    logger.info("Running scheduled job: manageEventStatus.");
    try {
        await runManageEventStatus();
    } catch (error) {
        logger.error("Error in manageEventStatus scheduled job:", { error });
    }
});


// Reusable core logic for the Promoter
async function runPromoteNextEvent() {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const liveEventRef = db.collection("settings").doc("liveEvent");

    // Priority 1: Find a currently LIVE and published event.
    const liveQuery = db.collection("events")
        .where("status", "==", "live")
        .where("isPublished", "==", true)
        .orderBy("scheduledStartTime", "desc")
        .limit(1);
    let promotionSnapshot = await liveQuery.get();

    // Priority 2: If no live event, find the SOONEST upcoming and published event.
    if (promotionSnapshot.empty) {
        const upcomingQuery = db.collection("events")
            .where("status", "==", "upcoming")
            .where("isPublished", "==", true)
            .where("scheduledStartTime", ">", now)
            .orderBy("scheduledStartTime", "asc")
            .limit(1);
        promotionSnapshot = await upcomingQuery.get();
    }
    
    const liveEventDoc = await liveEventRef.get();
    const currentLiveEventOnBillboard = liveEventDoc.exists ? liveEventDoc.data() : null;

    // CASE 1: We found a valid event that should be on the billboard.
    if (!promotionSnapshot.empty) {
        const eventToPromoteDoc = promotionSnapshot.docs[0];
        const eventToPromoteData = eventToPromoteDoc.data();
        
        if (currentLiveEventOnBillboard?.eventId === eventToPromoteDoc.id) {
            const message = `Promoter: Event '${eventToPromoteData.eventTitle}' is already on billboard. No action needed.`;
            logger.info(message);
            return message;
        }

        // THIS IS THE BULLETPROOF FIX: Provide a safe fallback for EVERY field.
        // This prevents the function from ever trying to write 'undefined' to Firestore, which causes a crash.
        const newBillboardData = {
            eventId: eventToPromoteDoc.id,
            eventTitle: eventToPromoteData.eventTitle || "Untitled Event",
            eventImageUrl: eventToPromoteData.thumbnailUrl || null,
            isPublished: eventToPromoteData.isPublished === true,
            isTicketed: eventToPromoteData.isTicketed === true,
            // --- THIS IS THE FIX ---
            // Add the ticketPrice to the global billboard object.
            ticketPrice: eventToPromoteData.ticketPrice || 0,
            scheduledStartTime: eventToPromoteData.scheduledStartTime || now,
            scheduledEndTime: eventToPromoteData.scheduledEndTime || now,
            status: eventToPromoteData.status || "unknown",
            promotedAt: now
        };
        
        const message = `Promoter: Promoting '${newBillboardData.eventTitle}' (Status: ${newBillboardData.status}) to billboard.`;
        logger.info(message);
        await liveEventRef.set(newBillboardData);
        return message;

    // CASE 2: We found no valid live or upcoming event. The billboard should be cleared.
    } else {
        if (currentLiveEventOnBillboard?.status === 'no_event_scheduled') {
            const message = "Promoter: No live or upcoming events and billboard is already clear. No action needed.";
            logger.info(message);
            return message;
        }

        const message = `Promoter: No live or upcoming events found. Clearing stale event from billboard.`;
        logger.info(message);
        await liveEventRef.set({ status: 'no_event_scheduled', updatedAt: now });
        return message;
    }
}

// The scheduled function now simply calls our reusable logic.
exports.promoteNextEvent = onSchedule("every 5 minutes", async (event) => {
    logger.info("Running scheduled job: promoteNextEvent.");
    try {
        await runPromoteNextEvent();
    } catch (error) {
        logger.error("Error in promoteNextEvent scheduled job:", { error });
    }
});

// =====================================================================
// ============= END: AUTOMATED EVENT LIFECYCLE SYSTEM =================
// =====================================================================

      // =====================================================================
// =========== MANUAL TRIGGER FOR AUTOMATION DIAGNOSTICS ===============
// =====================================================================
exports.triggerManualAutomation = onCall(async (request) => {
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.super_admin)) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }
    logger.info(`Admin '${request.auth.uid}' manually triggered the automation engine.`);
    
    let statusMessage = "Not run.";
    let promoterMessage = "Not run.";

    try {
        logger.info("Attempting to run Status Manager...");
        statusMessage = await runManageEventStatus();
        logger.info("Status Manager completed successfully.");
    } catch (error) {
        logger.error("FATAL ERROR in Status Manager:", error);
        throw new HttpsError("internal", "The 'Status Manager' function failed.", error.message);
    }

    try {
        logger.info("Attempting to run Promoter...");
        promoterMessage = await runPromoteNextEvent();
        logger.info("Promoter completed successfully.");
    } catch (error) {
        logger.error("FATAL ERROR in Promoter:", error);
        throw new HttpsError("internal", "The 'Promoter' function failed.", error.message);
    }
    
    const successMessage = "Manual trigger successful. See results below.";
    logger.info(successMessage, { statusMessage, promoterMessage });
    return { success: true, message: successMessage, results: { statusMessage, promoterMessage } };
});  

       exports.postComment = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) { throw new HttpsError("unauthenticated", "You must be logged in to comment."); }

    const { itemId, itemType, text, replyTo } = request.data;
    if (!itemId || !itemType || !text || text.trim() === '') { throw new HttpsError("invalid-argument", "Missing required comment data."); }
    if (text.length > 1000) { throw new HttpsError("invalid-argument", "Comment cannot exceed 1000 characters."); }

    const db = admin.firestore();
    const creatorRef = db.collection("creators").doc(uid);
    const creatorDoc = await creatorRef.get();
    if (!creatorDoc.exists) { throw new HttpsError("not-found", "Your user profile could not be found."); }
    const creatorData = creatorDoc.data();

    const isAdmin = request.auth.token.admin === true;
    const isAuthority = request.auth.token.authority === true;

    if (!isAdmin && !isAuthority) {
        const lastCommentTime = creatorData.lastCommentTimestamp?.toDate() || new Date(0);
        const thirtySecondsAgo = new Date(Date.now() - 30000);
        if (lastCommentTime > thirtySecondsAgo) {
            throw new HttpsError("resource-exhausted", "Please wait 30 seconds before posting another comment.");
        }
    }

    let itemRef;
    if (itemType === 'content') {
        itemRef = db.doc(`artifacts/production-app-id/public/data/content_items/${itemId}`);
    } else if (itemType === 'opportunity') {
        itemRef = db.doc(`opportunities/${itemId}`);
    } else if (itemType === 'event') {
        itemRef = db.doc(`events/${itemId}`);
    } else {
        throw new HttpsError("invalid-argument", `Unsupported itemType: '${itemType}'.`);
    }

    const itemDoc = await itemRef.get();
    if (!itemDoc.exists) { throw new HttpsError("not-found", "The item you are trying to comment on does not exist."); }
    const itemData = itemDoc.data();
    const itemTitle = itemData.title || itemData.eventTitle || "your post";

    let authorRole = 'user';
    if (request.auth.token.admin === true) authorRole = 'admin';
    else if (request.auth.token.authority === true) authorRole = 'authority';

    const newComment = {
        userId: uid,
        userName: creatorData.creatorName || "NVA User",
        userProfilePicture: creatorData.profilePictureUrl || '',
        text: text.trim(),
        createdAt: FieldValue.serverTimestamp(),
        replyTo: replyTo || null,
        authorRole: authorRole
    };

    const commentsRef = itemRef.collection("comments");
    const notificationsRef = db.collection("notifications");

    // Helper function for creating notifications to keep code DRY
    const createNotification = async (payload) => {
        await notificationsRef.add({
            ...payload,
            isRead: false,
            status: "pending",
            timestamp: admin.firestore.FieldValue.serverTimestamp() // Corrected
        });
        const userToNotifyRef = db.collection("creators").doc(payload.userId);
        await userToNotifyRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
    };

    // Perform main database writes in a transaction
    await db.runTransaction(async (transaction) => {
        const newCommentRef = commentsRef.doc();
        transaction.set(newCommentRef, newComment);
        transaction.update(creatorRef, { lastCommentTimestamp: admin.firestore.FieldValue.serverTimestamp() });
        transaction.update(itemRef, { commentCount: admin.firestore.FieldValue.increment(1) });
    });

    // Handle notifications AFTER the transaction
    const contentOwnerId = itemData.creatorId || itemData.postedByUid;
    const link = itemType === 'content' ? `/content/${itemId}` : '/MyListings';

    // Notify content owner
    if (contentOwnerId && contentOwnerId !== uid) {
        await createNotification({
            userId: contentOwnerId,
            title: "New Comment",
            body: `${creatorData.creatorName} commented on "${itemTitle}"`,
            link: link,
            deliveryType: ["inbox", "push", "toast"],
            notificationType: "NEW_COMMENT",
            sound: false
        });
    }

    // Notify user being replied to
    if (replyTo && replyTo.userId && replyTo.userId !== uid && replyTo.userId !== contentOwnerId) {
        await createNotification({
            userId: replyTo.userId,
            title: "New Reply",
            body: `${creatorData.creatorName} replied to your comment on "${itemTitle}"`,
            link: link,
            deliveryType: ["inbox", "push"],
            notificationType: "COMMENT_REPLY",
            sound: true
        });
    }

    // Handle comment cleanup (culling)
    const snapshot = await commentsRef.count().get();
    const count = snapshot.data().count;
    if (count > 500) {
        const oldestCommentQuery = commentsRef.orderBy('createdAt', 'asc').limit(1);
        const oldestCommentSnapshot = await oldestCommentQuery.get();
        if (!oldestCommentSnapshot.empty) {
            await oldestCommentSnapshot.docs[0].ref.delete();
            logger.info(`Culled oldest comment from item '${itemId}' to maintain count limit.`);
        }
    }

    return { success: true, message: "Comment posted." };
});

exports.deleteComment = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to delete comments.");
    }

    const { itemId, itemType, commentId } = request.data;
    if (!itemId || !itemType || !commentId) {
        throw new HttpsError("invalid-argument", "Missing required data to delete the comment.");
    }

    const db = admin.firestore();
    const itemRef = db.doc(itemType === 'content' ? `artifacts/production-app-id/public/data/content_items/${itemId}` : `opportunities/${itemId}`);
    const commentRef = itemRef.collection("comments").doc(commentId);

    try {
        const [itemDoc, commentDoc] = await Promise.all([
            itemRef.get(),
            commentRef.get()
        ]);

        if (!itemDoc.exists) { throw new HttpsError("not-found", "The parent content does not exist."); }
        if (!commentDoc.exists) { return { success: true, message: "Comment already deleted." }; }

        const itemData = itemDoc.data();
        const commentData = commentDoc.data();

        const isModerator = request.auth.token.admin === true || request.auth.token.authority === true;
        const isCommentAuthor = uid === commentData.userId;
        const isContentOwner = uid === itemData.creatorId || uid === itemData.postedByUid;

        if (!isModerator && !isCommentAuthor && !isContentOwner) {
            throw new HttpsError("permission-denied", "You do not have permission to delete this comment.");
        }

        await db.runTransaction(async (transaction) => {
            transaction.delete(commentRef);
            transaction.update(itemRef, { commentCount: admin.firestore.FieldValue.increment(-1) });
        });

        return { success: true, message: "Comment deleted." };

    } catch (error) {
        logger.error(`Error deleting comment '${commentId}' by user '${uid}'`, { error });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while deleting the comment.");
    }
});

        // =====================================================================
// ============ START: LIVE EVENT CHAT FUNCTION ========================
// =====================================================================

exports.postChatMessage = onCall(async (request) => {
    // 1. Authentication & User Data Validation
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to chat.");
    }

    const { eventId, text, replyTo } = request.data;
    if (!eventId || !text || text.trim() === '') {
        throw new HttpsError("invalid-argument", "Missing event ID or message text.");
    }
    if (text.length > 500) {
        throw new HttpsError("invalid-argument", "Message cannot exceed 500 characters.");
    }

    const db = admin.firestore();
    const creatorRef = db.collection("creators").doc(uid);
    const eventRef = db.collection("events").doc(eventId);
    // --- NEW MUTE CHECK ---
    const muteRef = eventRef.collection("mutedUsers").doc(uid);

    const [creatorDoc, eventDoc, muteDoc] = await Promise.all([
        creatorRef.get(),
        eventRef.get(),
        muteRef.get() // Read the user's mute status
    ]);

    if (!creatorDoc.exists) { throw new HttpsError("not-found", "Your user profile could not be found."); }
    if (!eventDoc.exists) { throw new HttpsError("not-found", "The event you are trying to chat in does not exist."); }
    
    // --- NEW MUTE ENFORCEMENT ---
    if (muteDoc.exists) {
        const muteData = muteDoc.data();
        if (muteData.muteExpiresAt.toDate() > new Date()) {
            throw new HttpsError("permission-denied", "You have been muted by a moderator and cannot send messages.");
        }
    }
    
    const eventData = eventDoc.data();
    if (eventData.status !== 'live') {
        throw new HttpsError("failed-precondition", "Chat is only available during live events.");
    }

    const creatorData = creatorDoc.data();
    const isModerator = request.auth.token.admin === true || request.auth.token.authority === true;
    
    if (!isModerator) {
        const lastChatMessageTime = creatorData.lastChatMessageTimestamp?.toDate() || new Date(0);
        const tenSecondsAgo = new Date(Date.now() - 10000);
        if (lastChatMessageTime > tenSecondsAgo) {
            throw new HttpsError("resource-exhausted", "Please wait a moment before sending another message.");
        }
    }

    let authorRole = 'user'; // Default role
    if (request.auth.token.admin === true) {
        authorRole = 'admin';
    } else if (request.auth.token.authority === true) {
        authorRole = 'authority';
    }

    const newChatMessage = {
        userId: uid,
        userName: creatorData.creatorName || "NVA User",
        userProfilePicture: creatorData.profilePictureUrl || '',
        text: text.trim(),
        createdAt: FieldValue.serverTimestamp(),
        replyTo: replyTo || null,
        authorRole: authorRole // Add the author's role to the document
    };

    const chatMessagesRef = eventRef.collection("chatMessages");
    await db.runTransaction(async (transaction) => {
        const newChatMessageRef = chatMessagesRef.doc();
        transaction.set(newChatMessageRef, newChatMessage);
        transaction.update(creatorRef, { lastChatMessageTimestamp: admin.firestore.FieldValue.serverTimestamp() });
    });

    return { success: true, message: "Message sent." };
});

    exports.deleteChatMessage = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to delete messages.");
    }

    const { eventId, messageId } = request.data;
    if (!eventId || !messageId) {
        throw new HttpsError("invalid-argument", "Missing event ID or message ID.");
    }

    const db = admin.firestore();
    const messageRef = db.collection("events").doc(eventId).collection("chatMessages").doc(messageId);
    
    try {
        const messageDoc = await messageRef.get();
        if (!messageDoc.exists) {
            return { success: true, message: "Message already deleted." };
        }

        const messageData = messageDoc.data();
        const isModerator = request.auth.token.admin === true || request.auth.token.authority === true;
        const isMessageAuthor = uid === messageData.userId;

        if (!isModerator && !isMessageAuthor) {
            throw new HttpsError("permission-denied", "You do not have permission to delete this message.");
        }

        await messageRef.delete();
        return { success: true, message: "Message deleted." };

    } catch (error) {
        logger.error(`Error deleting chat message '${messageId}' by user '${uid}'`, { error });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while deleting the message.");
    }
});

    exports.muteUserInChat = onCall(async (request) => {
    // 1. Security Check: Only moderators can mute users.
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin)) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }

    const { eventId, userIdToMute, durationHours } = request.data;
    if (!eventId || !userIdToMute || typeof durationHours !== 'number') {
        throw new HttpsError("invalid-argument", "Missing eventId, userIdToMute, or durationHours.");
    }

    const db = admin.firestore();
    const muteRef = db.collection("events").doc(eventId).collection("mutedUsers").doc(userIdToMute);
    const eventRef = db.collection("events").doc(eventId);
    const now = new Date();
    let muteExpiresAt;

    // 2. Calculate Expiration Timestamp
    if (durationHours === 0) { // A duration of 0 means "mute for the rest of the event"
        const eventDoc = await eventRef.get();
        if (!eventDoc.exists) {
            throw new HttpsError("not-found", "The event could not be found to determine the end time.");
        }
        muteExpiresAt = eventDoc.data().scheduledEndTime.toDate();
    } else {
        muteExpiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
    }
    
    // 3. Write the mute record to the database.
    await muteRef.set({
        mutedBy: request.auth.uid,
        mutedAt: now,
        muteExpiresAt: admin.firestore.Timestamp.fromDate(muteExpiresAt)
    });

    logger.info(`Moderator '${request.auth.uid}' muted user '${userIdToMute}' in event '${eventId}' for ${durationHours} hours.`);
    return { success: true, message: "User has been muted in this chat." };
});

    exports.unmuteUserInChat = onCall(async (request) => {
    // 1. Security Check: Only moderators can unmute users.
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin)) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }

    const { eventId, userIdToUnmute } = request.data;
    if (!eventId || !userIdToUnmute) {
        throw new HttpsError("invalid-argument", "Missing eventId or userIdToUnmute.");
    }

    const db = admin.firestore();
    const muteRef = db.collection("events").doc(eventId).collection("mutedUsers").doc(userIdToUnmute);
    
    // 2. Delete the mute record from the database.
    await muteRef.delete();

    logger.info(`Moderator '${request.auth.uid}' unmuted user '${userIdToUnmute}' in event '${eventId}'.`);
    return { success: true, message: "User has been unmuted in this chat." };
});

    exports.toggleEventChat = onCall(async (request) => {
    // Security Check: Only moderators can perform this action.
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin)) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }

    const { eventId, isChatEnabled } = request.data;
    if (!eventId || typeof isChatEnabled !== 'boolean') {
        throw new HttpsError("invalid-argument", "Missing eventId or a valid isChatEnabled flag.");
    }

    const db = admin.firestore();
    const eventRef = db.collection("events").doc(eventId);

    try {
        await eventRef.update({
            isChatEnabled: isChatEnabled
        });
        logger.info(`Moderator '${request.auth.uid}' set isChatEnabled to ${isChatEnabled} for event '${eventId}'.`);
        return { success: true, message: `Chat has been ${isChatEnabled ? 'enabled' : 'disabled'}.` };
    } catch (error) {
        logger.error(`Error toggling chat status for event '${eventId}':`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while updating the event.");
    }
});

        exports.likeLiveEvent = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to like an event.");
    }

    const { eventId } = request.data;
    if (!eventId) {
        throw new HttpsError("invalid-argument", "Missing required eventId.");
    }

    const db = admin.firestore();
    const eventRef = db.collection("events").doc(eventId);
    const likeRef = eventRef.collection("likes").doc(uid);

    try {
        await db.runTransaction(async (transaction) => {
            const likeDoc = await transaction.get(likeRef);
            if (likeDoc.exists) {
                // User has already liked, so we will "unlike"
                transaction.delete(likeRef);
                transaction.update(eventRef, { likeCount: admin.firestore.FieldValue.increment(-1) });
            } else {
                // User has not liked yet
                transaction.set(likeRef, { likedAt: admin.firestore.FieldValue.serverTimestamp() });
                transaction.update(eventRef, { likeCount: admin.firestore.FieldValue.increment(1) });
            }
        });
        return { success: true, message: "Like status updated." };
    } catch (error) {
        logger.error(`Error toggling like for event '${eventId}' by user '${uid}':`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while updating like status.");
    }
});

exports.incrementEventView = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        // Silently fail for non-authenticated users, as this is a passive metric.
        return { success: false, message: "User not authenticated." };
    }

    const { eventId } = request.data;
    if (!eventId) {
        throw new HttpsError("invalid-argument", "Missing required eventId.");
    }

    const db = admin.firestore();
    const eventRef = db.collection("events").doc(eventId);

    try {
        await eventRef.update({
            totalViewCount: admin.firestore.FieldValue.increment(1)
        });
        return { success: true, message: "View count incremented." };
    } catch (error) {
        logger.error(`Error incrementing view count for event '${eventId}':`, error);
        // Do not throw HttpsError to the client, as this is a background task.
        return { success: false, message: "An error occurred on the server." };
    }
});

    exports.publishEventAsContent = onCall(async (request) => {
    // 1. Security Check: Only admins can perform this action.
    if (!request.auth || (request.auth.token.admin !== true && request.auth.token.super_admin !== true)) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }

    const { eventId, categoryName } = request.data;
    if (!eventId || !categoryName) {
        throw new HttpsError("invalid-argument", "Missing required eventId or categoryName.");
    }

    const db = admin.firestore();
    const eventRef = db.collection("events").doc(eventId);

    try {
        const eventDoc = await eventRef.get();
        if (!eventDoc.exists) {
            throw new HttpsError("not-found", "The specified event does not exist.");
        }

        const eventData = eventDoc.data();

        // 2. Validation Checks
        if (eventData.status !== 'completed') {
            throw new HttpsError("failed-precondition", "Only completed events can be published as VOD.");
        }
        if (eventData.isPublishedAsVOD === true) {
            throw new HttpsError("already-exists", "This event has already been published as a VOD.");
        }

        // 3. Construct the new content item object with the DYNAMIC category
        const newContentItem = {
            title: eventData.eventTitle || "Untitled Event Replay",
            description: eventData.eventDescription || "",
            mainUrl: eventData.liveStreamUrl,
            customThumbnailUrl: eventData.thumbnailUrl,
            contentType: categoryName, // Use the category selected by the admin
            creatorId: "nva-system", 
            creatorName: "NVA Replays",
            likeCount: eventData.likeCount || 0,
            viewCount: eventData.totalViewCount || 0,
            createdAt: new Date().toISOString(),
            isActive: true,
            isCurated: true,
        };
        
        const contentRef = db.collection("artifacts/production-app-id/public/data/content_items");

        // 4. Perform the write operations
        await contentRef.add(newContentItem);
        await eventRef.update({ isPublishedAsVOD: true });

        logger.info(`Admin '${request.auth.uid}' successfully published event '${eventId}' to category '${categoryName}'.`);
        return { success: true, message: `Event successfully published to ${categoryName}.` };

    } catch (error) {
        logger.error(`Error publishing event '${eventId}' as VOD:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred during the publishing process.");
    }
});

// =====================================================================
// ============= END: LIVE EVENT CHAT FUNCTION =========================
// ====================================================================

    // =====================================================================
// ============ START: CAMPAIGN COOLDOWN & USER CLEANUP ================
// =====================================================================

exports.liftCampaignCooldown = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid || (!request.auth.token.admin && !request.auth.token.authority && !request.auth.token.super_admin)) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }
    const { targetUserId } = request.data;
    if (!targetUserId) {
        throw new HttpsError("invalid-argument", "Missing targetUserId.");
    }
    // Security check: Authority cannot lift their own cooldown.
    if (request.auth.token.authority && uid === targetUserId) {
        throw new HttpsError("permission-denied", "Authorities cannot lift their own campaign cooldowns.");
    }

    const db = admin.firestore();
    const targetUserRef = db.collection("creators").doc(targetUserId);
    try {
        await targetUserRef.update({
            canCreateCampaignAfter: admin.firestore.FieldValue.delete()
        });
        logger.info(`Moderator '${uid}' lifted the campaign cooldown for user '${targetUserId}'.`);
        return { success: true, message: "Campaign cooldown has been lifted for the user." };
    } catch (error) {
        logger.error(`Error lifting campaign cooldown for user '${targetUserId}':`, error);
        throw new HttpsError("internal", "An unexpected error occurred.");
    }
});

    // =====================================================================
// ============ START: USER-INITIATED ACCOUNT DELETION =================
// =====================================================================

// Helper function to delete all documents in a collection/sub-collection.
async function deleteCollection(db, collectionRef, batchSize) {
    const query = collectionRef.orderBy('__name__').limit(batchSize);
    return new Promise((resolve, reject) => {
        deleteQueryBatch(db, query, resolve).catch(reject);
    });
}
async function deleteQueryBatch(db, query, resolve) {
    const snapshot = await query.get();
    if (snapshot.size === 0) {
        resolve();
        return;
    }
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
    process.nextTick(() => {
        deleteQueryBatch(db, query, resolve);
    });
}

// Helper function to recursively delete all files in a storage folder.
async function deleteStorageFolder(bucket, path) {
    try {
        await bucket.deleteFiles({ prefix: path });
        logger.info(`Successfully deleted all files in storage path: ${path}`);
    } catch (error) {
        logger.error(`Error deleting storage folder ${path}:`, error);
    }
}

exports.deleteOwnAccount = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to delete your account.");
    }

    logger.warn(`[DESTRUCTIVE ACTION] User '${uid}' has initiated their own account deletion. Wiping all associated data.`);

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const batchSize = 400;

    try {
        // --- STEP 1: Anonymize Comments ---
        // CRITICAL: This requires a Firestore index. See instructions.
        const commentsQuery = db.collectionGroup('comments').where('userId', '==', uid);
        const commentsSnapshot = await commentsQuery.get();
        if (!commentsSnapshot.empty) {
            let batch = db.batch();
            let i = 0;
            for (const doc of commentsSnapshot.docs) {
                batch.update(doc.ref, { userName: "[Deleted User]", userProfilePicture: '', userId: 'deleted_user' });
                i++;
                if (i >= batchSize) { await batch.commit(); batch = db.batch(); i = 0; }
            }
            if (i > 0) await batch.commit();
            logger.info(`Anonymized ${commentsSnapshot.size} comments for user '${uid}'.`);
        }
        
        // --- STEP 2: Delete All Top-Level Content ---
        const collectionsToDelete = [
            `artifacts/production-app-id/public/data/content_items`,
            `artifacts/production-app-id/public/data/campaigns`,
            'opportunities',
            'reports',
        ];
        const idFieldMap = { 'opportunities': 'postedByUid', 'reports': 'reporterId' };
        
        for (const colPath of collectionsToDelete) {
            const idField = idFieldMap[colPath] || 'creatorId';
            const q = db.collection(colPath).where(idField, '==', uid);
            const snapshot = await q.get();
            if (!snapshot.empty) {
                let batch = db.batch();
                let i = 0;
                for (const doc of snapshot.docs) {
                    batch.delete(doc.ref);
                    i++;
                    if (i >= batchSize) { await batch.commit(); batch = db.batch(); i = 0; }
                }
                if (i > 0) await batch.commit();
                logger.info(`Deleted ${snapshot.size} documents from '${colPath}' for user '${uid}'.`);
            }
        }

        // --- STEP 3: Delete all uploaded files from Cloud Storage ---
        await deleteStorageFolder(bucket, `profile_pictures/${uid}/`);
        await deleteStorageFolder(bucket, `content_thumbnails/${uid}/`);
        await deleteStorageFolder(bucket, `campaign_thumbnails/${uid}/`);
        await deleteStorageFolder(bucket, `opportunity_flyers/${uid}/`);
        await deleteStorageFolder(bucket, `promo_flyers/${uid}/`);
        await deleteStorageFolder(bucket, `creator_uploads/${uid}/`);

        // --- REVISED STEP 4: Reciprocal Follow Cleanup & Subcollection Purge [1] ---
        const userRef = db.collection('creators').doc(uid);
        
        // 1. Wipe my reciprocal following records from other users' follower lists
        const myFollowingRef = userRef.collection("following");
        const myFollowingSnap = await myFollowingRef.get();
        if (!myFollowingSnap.empty) {
            for (const doc of myFollowingSnap.docs) {
                const targetUserRef = db.collection("creators").doc(doc.id);
                await targetUserRef.collection("followers").doc(uid).delete().catch(() => {});
                await targetUserRef.update({ followerCount: admin.firestore.FieldValue.increment(-1) }).catch(() => {});
            }
        }

        // 2. Wipe my reciprocal follower records from other users' following lists
        const myFollowersRef = userRef.collection("followers");
        const myFollowersSnap = await myFollowersRef.get();
        if (!myFollowersSnap.empty) {
            for (const doc of myFollowersSnap.docs) {
                const targetUserRef = db.collection("creators").doc(doc.id);
                await targetUserRef.collection("following").doc(uid).delete().catch(() => {});
                await targetUserRef.update({ followingCount: admin.firestore.FieldValue.increment(-1) }).catch(() => {});
            }
        }

        const subcollections = ['followers', 'following', 'blockedUsers', 'blockedBy', 'savedOpportunities', 'seenNotifications', 'feed'];
        for (const sub of subcollections) {
            await deleteCollection(db, userRef.collection(sub), batchSize);
            logger.info(`Deleted sub-collection '${sub}' for user '${uid}'.`);
        }
        
        // Now delete the main document itself.
        await userRef.delete();
        logger.info(`Deleted main creator document for '${uid}'.`);
        
        // --- FINAL STEP: Delete the Firebase Auth User ---
        await admin.auth().deleteUser(uid);
        logger.info(`Permanently deleted Auth user '${uid}'. Deletion process complete.`);

        return { success: true, message: "Account successfully deleted." };

    } catch (error) {
        logger.error(`[FATAL DELETION ERROR] for user ${uid}:`, error);
        throw new HttpsError("internal", `An error occurred during account deletion: ${error.message}`);
    }
});
// =====================================================================
// ============== END: USER-INITIATED ACCOUNT DELETION =================
// =====================================================================

// This is the reusable core logic for the cleanup process.
async function runGhostAccountCleanup() {
    logger.info("Executing ghost account cleanup logic...");
    const db = admin.firestore();
    const auth = admin.auth();
    let ghostsDeleted = 0;
    
    // This helper function fetches all users from Firebase Auth, handling pagination.
    const listAllAuthUsers = async (nextPageToken) => {
        let allUsers = [];
        const listUsersResult = await auth.listUsers(1000, nextPageToken);
        allUsers = allUsers.concat(listUsersResult.users);
        if (listUsersResult.pageToken) {
            allUsers = allUsers.concat(await listAllUsers(listUsersResult.pageToken));
        }
        return allUsers;
    };

    const allAuthUsers = await listAllAuthUsers();
    const allAuthUserIds = new Set(allAuthUsers.map(u => u.uid));
    logger.info(`Found ${allAuthUserIds.size} total users in Firebase Authentication.`);

    const firestoreUsersSnapshot = await db.collection('creators').get();
    const batch = db.batch();

    firestoreUsersSnapshot.forEach(doc => {
        // If a Firestore document ID does NOT exist in the set of real Auth UIDs, it's a ghost.
        if (!allAuthUserIds.has(doc.id)) {
            logger.warn(`Found ghost Firestore document for deleted auth user: '${doc.id}'. Scheduling for deletion.`);
            batch.delete(doc.ref);
            ghostsDeleted++;
        }
    });

    if (ghostsDeleted > 0) {
        await batch.commit();
        const message = `Cleanup complete. Found and deleted ${ghostsDeleted} ghost user document(s).`;
        logger.info(message);
        return { message }; // Return the result message
    } else {
        const message = "Cleanup complete. No ghost user documents were found.";
        logger.info(message);
        return { message }; // Return the result message
    }
}

// 1. THE AUTOMATED, SCHEDULED FUNCTION
// This will run at 03:00 on the 1st day of every month.
exports.scheduledGhostCleanup = onSchedule("0 3 1 * *", async (event) => {
    logger.info("Running scheduled job: Ghost Account Cleanup.");
    try {
        await runGhostAccountCleanup();
    } catch (error) {
        logger.error("Error during scheduled ghost account cleanup:", { error });
    }
    return null; // Scheduled functions should return null or a promise.
});

    // 2. THE MANUAL TRIGGER FUNCTION FOR THE ADMIN PANEL
exports.manualGhostCleanup = onCall(async (request) => {
    // Security Check: Only an admin can run this action.
    if (!request.auth || (request.auth.token.admin !== true && request.auth.token.super_admin !== true)) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }
    
    logger.info(`Admin '${request.auth.uid}' manually triggered Ghost Account Cleanup.`);

    try {
        const result = await runGhostAccountCleanup();
        // The result object from the helper function contains the message.
        return { success: true, message: result.message };
    } catch (error) {
        logger.error("Error in manually triggered ghost account cleanup", { error });
        throw new HttpsError("internal", "An error occurred during the cleanup process.", error.message);
    }
});

// =====================================================================
// ============== END: CAMPAIGN COOLDOWN & USER CLEANUP ================
// =====================================================================

// =====================================================================
// ============ START: NEW DESTRUCTIVE DELETE USER FUNCTION ============
// =====================================================================
exports.deleteUserAccount = onCall(async (request) => {
    if (!request.auth || (request.auth.token.admin !== true && request.auth.token.super_admin !== true)) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }
    const { userIdToDelete } = request.data;
    if (!userIdToDelete) {
        throw new HttpsError("invalid-argument", "Missing userIdToDelete.");
    }
    
    logger.warn(`[DESTRUCTIVE ACTION] Admin '${request.auth.uid}' initiated core data deletion for user '${userIdToDelete}'.`);

    const db = admin.firestore();

    try {
        // Step 1: Delete from Firebase Authentication.
        try {
            await admin.auth().deleteUser(userIdToDelete);
            logger.info(`Auth user ${userIdToDelete} deleted successfully.`);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                logger.warn(`Auth user ${userIdToDelete} was not found. Continuing.`);
            } else {
                throw error;
            }
        }

        // Step 2: Delete the main Firestore document ONLY.
        const userRef = db.collection('creators').doc(userIdToDelete);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            await userRef.delete();
            logger.info(`Main creator document for ${userIdToDelete} deleted successfully.`);
        } else {
            logger.warn(`Main creator document for ${userIdToDelete} was not found.`);
        }

        // NOTE: All other data is now intentionally orphaned.
        // The Admin "Data Integrity Audit" tool is now responsible for this cleanup.
        // This guarantees that the core user deletion ALWAYS succeeds.

        return { success: true, message: `Core account for user ${userIdToDelete} has been deleted. Please run the Data Integrity Audit tool to clean up all remaining orphaned data.` };

    } catch (error) {
        logger.error(`[FATAL DELETION ERROR] for user ${userIdToDelete}:`, error);
        throw new HttpsError("internal", `An error occurred during core deletion: ${error.message}`);
    }
});

    // =====================================================================
// =========== START: DESTRUCTIVE FULL DATA RESET FUNCTION =============
// =====================================================================
exports.deleteAllUserDataAndContent = onCall(async (request) => {
    // SECURITY: Only a verified admin can run this function.
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
        throw new HttpsError("permission-denied", "CRITICAL: You must be an admin to perform this action.");
    }
    const adminUid = request.auth.uid;
    logger.warn(`[!!! DESTRUCTIVE ACTION !!!] Admin '${adminUid}' has initiated a full database reset.`);

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const auth = admin.auth();
    const batchSize = 400; // Number of documents to delete per batch.

    // --- Consolidated Global Deletion Helper to Prevent Code Overwrite Crashes [1] ---
async function deleteCollection(db, collectionRef, batchSize = 400) {
    const query = collectionRef.orderBy('__name__').limit(batchSize);
    return new Promise((resolve, reject) => {
        deleteQueryBatch(db, query, resolve).catch(reject);
    });
}
async function deleteQueryBatch(db, query, resolve) {
    const snapshot = await query.get();
    if (snapshot.size === 0) { return resolve(); }
    const batch = db.batch();
    snapshot.docs.forEach(doc => { batch.delete(doc.ref); });
    await batch.commit();
    process.nextTick(() => { deleteQueryBatch(db, query, resolve); });
}
    
    // --- Helper function to recursively delete storage folders ---
    async function deleteStorageFolder(path) {
        try {
            await bucket.deleteFiles({ prefix: path });
            logger.info(`Successfully deleted all files in storage path: ${path}`);
        } catch (error) {
            logger.error(`Error deleting storage folder ${path}:`, error.message);
        }
    }
    
    try {
        // --- STEP 1: Define all user-generated data locations ---
        // THE FIX: Protect financial ledger logs so your P&L system maintains accurate auditing [1]
        const collectionsToDelete = [
            'competitions', 'opportunities', 'events', 'promotedStatuses', 
            'reports', 'appeals', 
            'contactSubmissions', 'notifications', 'broadcast_notifications',
            'chats', 'enrollmentApplications'
        ];
        const artifactSubcollectionsToDelete = ['campaigns', 'content_items'];
        const storagePrefixesToDelete = [
            'profile_pictures/', 'content_thumbnails/', 'campaign_thumbnails/', 
            'opportunity_flyers/', 'promo_flyers/', 'creator_uploads/', 'competition_entries/'
        ];

        // --- STEP 2: Deep-Clean Wipe of all Root Collections & Nested Subcollections [1] ---
        for (const colPath of collectionsToDelete) {
            logger.info(`Deep-cleaning collection: '${colPath}'...`);
            const colRef = db.collection(colPath);
            const snapshot = await colRef.get();
            
            for (const doc of snapshot.docs) {
                // EQUIP THE NUKE: Recursively find and kill all hidden subcollections (Messages, Comments, Likes, Entries) [1]
                const subcollections = await doc.ref.listCollections();
                for (const sub of subcollections) {
                    await deleteCollection(db, sub, batchSize);
                }
                await doc.ref.delete();
            }
        }
        for (const subColPath of artifactSubcollectionsToDelete) {
            const fullPath = `artifacts/production-app-id/public/data/${subColPath}`;
            logger.info(`Deleting artifact subcollection: '${fullPath}'...`);
            
            // Cascade delete nested subcollections (comments and likes) inside content_items before deletion [1]
            if (subColPath === 'content_items') {
                const contentColRef = db.collection(fullPath);
                const contentDocs = await contentColRef.get();
                for (const doc of contentDocs.docs) {
                    await deleteCollection(db, doc.ref.collection("comments"), batchSize);
                    await deleteCollection(db, doc.ref.collection("likes"), batchSize);
                    await doc.ref.delete();
                }
            } else {
                await deleteCollection(db, db.collection(fullPath), batchSize);
            }
        }

        // --- STEP 3: Delete all user-uploaded files from Storage ---
        for (const prefix of storagePrefixesToDelete) {
            logger.info(`Deleting storage prefix: '${prefix}'...`);
            await deleteStorageFolder(prefix);
        }
        
        // --- STEP 4: Delete all users (Firestore Docs & Auth accounts), EXCEPT active Admin/Staff Accounts ---
        logger.info("Deleting all standard user accounts, preserving calling admin and other staff roles...");
        const usersSnapshot = await db.collection('creators').get();
        const userDeletionPromises = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data() || {};
            // THE FIX: Guard all administrative, moderator, and authority accounts from accidental deletion
            const isStaff = userData.role === 'admin' || userData.role === 'super_admin' || userData.role === 'authority';
            
            if (doc.id !== adminUid && !isStaff) {
                // Delete the Auth user
                userDeletionPromises.push(auth.deleteUser(doc.id).catch(err => logger.error(`Failed to delete auth user ${doc.id}`, err)));
                // Delete the firestore doc directly
                userDeletionPromises.push(doc.ref.delete().catch(err => logger.error(`Failed to delete firestore doc for user ${doc.id}`, err)));
            }
        });
        await Promise.all(userDeletionPromises);
        
        // --- STEP 5: Wipe Admin Ghost Subcollections (Followers/Feed/Chats) & RESET Admin Testing Flags ---
        const adminRef = db.collection('creators').doc(adminUid);
        const subcollectionsToWipe = ['followers', 'following', 'feed', 'notifications', 'blockedUsers'];
        for (const subCol of subcollectionsToWipe) {
            await deleteCollection(adminRef.collection(subCol));
        }

       // Reset Admin's active enrollment flags so you can cleanly re-test registration!
        const adminDoc = await adminRef.get();
        // THE FIX: Extract current role and write it back explicitly to guarantee they are never demoted/downgraded
        const currentRole = adminDoc.exists ? (adminDoc.data().role || 'super_admin') : 'super_admin';

        await adminRef.update({
            isClassMember: false,
            isFilmClub: false,
            isContestant: false,
            badges: [],
            role: currentRole, // Guarantees role persistence
            cooldowns: FieldValue.delete() // THE FIX: Prevents undefined property crash
        });

        logger.info(`Deleted ${userDeletionPromises.length / 2} user accounts, sanitized Admin subcollections, and reset testing flags.`);

        const successMessage = "Full data reset complete. All user and content data has been wiped. Your admin account remains.";
        logger.info(successMessage);
        return { success: true, message: successMessage };

    } catch (error) {
        logger.error(`[FATAL RESET ERROR] An error occurred during the full data reset:`, error);
        throw new HttpsError("internal", `An error occurred during the reset: ${error.message}`);
    }
});
// =====================================================================
// ============ END: DESTRUCTIVE FULL DATA RESET FUNCTION ==============
// =====================================================================

    // =====================================================================
// =========== START: ADMIN FEED CLEAR UTILITY =========================
// =====================================================================
exports.clearAdminFeed = onCall(async (request) => {
    // SECURITY: Only an admin can run this function.
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }
    const adminUid = request.auth.uid;
    logger.info(`Admin '${adminUid}' has initiated a wipe of their personal feed subcollection.`);

    const db = admin.firestore();
    const batchSize = 400;

    // --- Helper function to recursively delete a collection ---
    async function deleteCollection(collectionRef) {
        const query = collectionRef.orderBy('__name__').limit(batchSize);
        return new Promise((resolve, reject) => {
            deleteQueryBatch(query, resolve).catch(reject);
        });
    }
    async function deleteQueryBatch(query, resolve) {
        const snapshot = await query.get();
        if (snapshot.size === 0) { return resolve(); }
        const batch = db.batch();
        snapshot.docs.forEach(doc => { batch.delete(doc.ref); });
        await batch.commit();
        process.nextTick(() => { deleteQueryBatch(query, resolve); });
    }

    try {
        const feedRef = db.collection('creators').doc(adminUid).collection('feed');
        await deleteCollection(feedRef);

        const successMessage = "Your personal feed has been successfully cleared of all items.";
        logger.info(successMessage);
        return { success: true, message: successMessage };

    } catch (error) {
        logger.error(`[FEED CLEAR ERROR] for admin ${adminUid}:`, error);
        throw new HttpsError("internal", `An error occurred while clearing the feed: ${error.message}`);
    }
});
// =====================================================================
// ============ END: ADMIN FEED CLEAR UTILITY ==========================
// =====================================================================

// =====================================================================
// ============= END: NEW DESTRUCTIVE DELETE USER FUNCTION =============
// =====================================================================

    exports.changeUserRole = onCall(async (request) => {
    const uid = request.auth.uid;
    /* TEMPORARILY DISABLED SECURITY CHECK
    if (!uid || (!request.auth.token.admin && !request.auth.token.authority)) {
        throw new HttpsError("permission-denied", "You must be a moderator to change user roles.");
    }
    */

    const { targetUserId, newRole } = request.data;
    if (!targetUserId || !newRole) {
        throw new HttpsError("invalid-argument", "Missing targetUserId or newRole.");
    }
    const validRoles = ['user', 'creator', 'authority', 'admin'];
    if (!validRoles.includes(newRole)) {
        throw new HttpsError("invalid-argument", `Invalid role specified: ${newRole}.`);
    }

    const db = admin.firestore();
    const targetUserRef = db.collection("creators").doc(targetUserId);

    try {
        const targetUserDoc = await targetUserRef.get();
        if (!targetUserDoc.exists) {
            throw new HttpsError("not-found", "The target user does not exist.");
        }
        
        const targetUserRole = targetUserDoc.data().role;
        const isCallerAdmin = request.auth.token.admin === true || request.auth.token.super_admin === true;
        const isCallerAuthority = request.auth.token.authority === true;

        // --- PERMISSION CHECKS ---
        if (isCallerAdmin && targetUserRole === 'admin') {
            throw new HttpsError("permission-denied", "Admins cannot change the roles of other admins.");
        }
        if (isCallerAuthority) {
            if (targetUserRole === 'admin' || targetUserRole === 'authority') {
                throw new HttpsError("permission-denied", "Authorities cannot change the roles of admins or other authorities.");
            }
            if (newRole === 'admin' || newRole === 'authority') {
                throw new HttpsError("permission-denied", "Authorities cannot assign moderator roles.");
            }
        }

        // --- THIS IS THE CRITICAL FIX ---
        // 1. Prepare the custom claims object based on the new role.
        const userRecord = await admin.auth().getUser(targetUserId);
        const currentClaims = userRecord.customClaims || {};
        
        const claims = {
            ...currentClaims,
            admin: newRole === 'admin',
            authority: newRole === 'authority'
        };

        // 2. Set the custom claims on the user's authentication token non-destructively.
        await admin.auth().setCustomUserClaims(targetUserId, claims);

        // 3. Update the role in the Firestore document for display purposes.
        await targetUserRef.update({ role: newRole });
        // --- END OF FIX ---

        logger.info(`Moderator '${uid}' changed role for user '${targetUserId}' to '${newRole}' and updated auth claims.`);
        
        return { success: true, message: `User role and permissions successfully updated to ${newRole}. The user must log out and back in for the change to take full effect.` };

    } catch (error) {
        logger.error("Error in changeUserRole function:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while changing the user role.");
    }
});

// =====================================================================
// =========== START: NEW DATA MIGRATION FUNCTION ======================
// =====================================================================
exports.backfillFollowerData = onCall(async (request) => {
    // Security Check: Only an admin can run this powerful operation.
    if (!request.auth || (request.auth.token.admin !== true && request.auth.token.super_admin !== true)) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }

    const uid = request.auth.uid;
    logger.info(`Admin '${uid}' initiated a backfill of follower/following data.`);
    const db = admin.firestore();
    const summary = { usersProcessed: 0, followsUpdated: 0 };

    try {
        const creatorsSnapshot = await db.collection("creators").get();
        const allUsersData = new Map(creatorsSnapshot.docs.map(doc => [doc.id, doc.data()]));

        for (const userDoc of creatorsSnapshot.docs) {
            const userId = userDoc.id;
            const followingRef = db.collection("creators").doc(userId).collection("following");
            const followersRef = db.collection("creators").doc(userId).collection("followers");

            // Batch for this user's updates
            const batch = db.batch();
            let updatesMade = false;

            // Process 'following' subcollection
            const followingSnapshot = await followingRef.get();
            followingSnapshot.forEach(followingDoc => {
                const targetUserId = followingDoc.id;
                const targetUserData = allUsersData.get(targetUserId);
                if (targetUserData && !followingDoc.data().creatorName) {
                    batch.update(followingDoc.ref, {
                        creatorName: targetUserData.creatorName || '',
                        profilePictureUrl: targetUserData.profilePictureUrl || ''
                    });
                    summary.followsUpdated++;
                    updatesMade = true;
                }
            });

            // Process 'followers' subcollection
            const followersSnapshot = await followersRef.get();
            followersSnapshot.forEach(followerDoc => {
                const followerId = followerDoc.id;
                const followerData = allUsersData.get(followerId);
                if (followerData && !followerDoc.data().creatorName) {
                    batch.update(followerDoc.ref, {
                        creatorName: followerData.creatorName || '',
                        profilePictureUrl: followerData.profilePictureUrl || ''
                    });
                    summary.followsUpdated++;
                    updatesMade = true;
                }
            });
            
            if(updatesMade) {
                await batch.commit();
            }
            summary.usersProcessed++;
        }

        const successMessage = `Backfill complete. Processed ${summary.usersProcessed} users and updated ${summary.followsUpdated} follow/follower records.`;
        logger.info(successMessage);
        return { success: true, message: successMessage };

    } catch (error) {
        logger.error("Error during follower data backfill:", error);
        throw new HttpsError("internal", "An error occurred during the data backfill process.", error.message);
    }
});
// =====================================================================
// ============ END: NEW DATA MIGRATION FUNCTION =======================
// =====================================================================

   // =====================================================================
// =========== START: AUTOMATED FEED PRUNING SYSTEM ====================
// =====================================================================

const FEED_LIMIT = 200; // The number of feed items to keep.

// This is the reusable core logic for the pruning process.
async function runFeedPruning() {
    const db = admin.firestore();
    logger.info(`Starting feed pruning process. Keeping the latest ${FEED_LIMIT} items per user.`);
    let usersProcessed = 0;
    let itemsPruned = 0;

    const usersSnapshot = await db.collection("creators").get();
    if (usersSnapshot.empty) {
        return "No users found to process.";
    }

    for (const userDoc of usersSnapshot.docs) {
        usersProcessed++;
        const feedRef = userDoc.ref.collection("feed");
        const feedSnapshot = await feedRef.get();

        if (feedSnapshot.size > FEED_LIMIT) {
            // THIS IS THE DEFINITIVE FIX: A "smarter" sorting function that handles both Timestamps and Strings.
            const sortedDocs = feedSnapshot.docs.sort((a, b) => {
                const getTime = (doc) => {
                    const createdAt = doc.data().createdAt;
                    if (!createdAt) return 0; // Handles missing date
                    if (typeof createdAt.toMillis === 'function') { // It's a Firestore Timestamp
                        return createdAt.toMillis();
                    }
                    if (typeof createdAt === 'string') { // It's an ISO string from older data
                        return new Date(createdAt).getTime();
                    }
                    return 0; // Fallback for any other unexpected type
                };
                return getTime(b) - getTime(a); // Sort newest first
            });

            const batch = db.batch();
            const itemsToDelete = sortedDocs.slice(FEED_LIMIT);
            itemsToDelete.forEach(doc => {
                batch.delete(doc.ref);
                itemsPruned++;
            });
            await batch.commit();
            logger.info(`Pruned ${itemsToDelete.length} old feed items for user '${userDoc.id}'.`);
        }
    }
    const message = `Feed pruning complete. Processed ${usersProcessed} users and pruned a total of ${itemsPruned} items.`;
    logger.info(message);
    return message;
}

// 2. THE MANUAL TRIGGER FUNCTION FOR THE ADMIN PANEL
exports.triggerFeedPrune = onCall(async (request) => {
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }
    logger.info(`Admin '${request.auth.uid}' manually triggered feed pruning.`);
    try {
        const resultMessage = await runFeedPruning();
        return { success: true, message: resultMessage };
    } catch (error) {
        logger.error("Error in manually triggered feed pruning:", { error });
        throw new HttpsError("internal", "An error occurred during the pruning process.", error.message);
    }
});

// =====================================================================
// ============ END: AUTOMATED FEED PRUNING SYSTEM =====================
// ===================================================================== 

// =====================================================================
// =========== UTILITY FUNCTION TO SET ADMIN CUSTOM CLAIM ==============
// =====================================================================
exports.setAdminClaim = onCall(async (request) => {
    // Security Check: Only an existing admin can make another admin.
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
      throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }
    const { targetUid } = request.data;
    if (!targetUid) {
      throw new HttpsError("invalid-argument", "Missing targetUid.");
    }
    try {
      const userRecord = await admin.auth().getUser(targetUid);
      const currentClaims = userRecord.customClaims || {};
      await admin.auth().setCustomUserClaims(targetUid, { ...currentClaims, admin: true });
      logger.info(`Admin '${request.auth.uid}' successfully set admin claim for user '${targetUid}'.`);
      return { success: true, message: `Admin claim set for user ${targetUid}.` };
    } catch (error) {
      logger.error(`Error setting admin claim for ${targetUid}:`, error);
      throw new HttpsError("internal", "An error occurred while setting the custom claim.");
    }
});

    exports.setAuthorityClaim = onCall(async (request) => {
    // Security Check: Only an admin can grant authority status.
    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
      throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }
    const { targetUid } = request.data;
    if (!targetUid) {
      throw new HttpsError("invalid-argument", "Missing targetUid.");
    }
    try {
      await admin.auth().setCustomUserClaims(targetUid, { authority: true });
      logger.info(`Admin '${request.auth.uid}' successfully set authority claim for user '${targetUid}'.`);
      return { success: true, message: `Authority claim set for user ${targetUid}.` };
    } catch (error) {
      logger.error(`Error setting authority claim for ${targetUid}:`, error);
      throw new HttpsError("internal", "An error occurred while setting the custom claim.");
    }
});

    exports.getServerTime = onCall({ cors: true }, (request) => {
    // This function simply returns the current server timestamp.
    return { serverTime: new Date().toISOString() };
});

 
// Called by the frontend to save a device's push notification token.
exports.saveFCMToken = onCall({ enforceAppCheck: false, cors: true }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const { token } = request.data;
    if (!token) {
        throw new HttpsError("invalid-argument", "Missing FCM token.");
    }
    const userRef = admin.firestore().collection("creators").doc(uid);
    // This is the fix: .set({ merge: true }) will create the document if it's missing,
    // or update the fcmTokens field if the document already exists.
    await userRef.set({
        fcmTokens: admin.firestore.FieldValue.arrayUnion(token)
    }, { merge: true }); // The critical merge option
    return { success: true, message: "Token saved." };
});

// Called when a user wants to clear their badge and mark all notifications as read.
exports.markAllNotificationsAsRead = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const db = admin.firestore();
    const userRef = db.collection("creators").doc(uid);
    const notificationsRef = db.collection("notifications");

    const query = notificationsRef.where("userId", "==", uid).where("isRead", "==", false);
    const snapshot = await query.get();

    if (snapshot.empty) {
        // If there are no unread notifications, ensure the badge is zero.
        await userRef.update({ unreadNotificationCount: 0 });
        return { success: true, message: "No unread notifications to mark." };
    }

    // Process in chunks of 499 to stay under the 500-write limit per batch.
    const batchSize = 499;
    let commitPromises = [];
    let batch = db.batch();
    let writeCount = 0;

    snapshot.forEach(doc => {
        batch.update(doc.ref, { isRead: true });
        writeCount++;
        if (writeCount === batchSize) {
            commitPromises.push(batch.commit());
            batch = db.batch();
            writeCount = 0;
        }
    });

    // Commit any remaining writes in the last batch.
    if (writeCount > 0) {
        commitPromises.push(batch.commit());
    }

    // Wait for all batches to complete.
    await Promise.all(commitPromises);

    // ONLY after all documents have been successfully marked as read, reset the counter.
    await userRef.update({ unreadNotificationCount: 0 });

    logger.info(`User '${uid}' marked ${snapshot.size} notifications as read.`);
    return { success: true, message: `Marked ${snapshot.size} notifications as read.` };
});

// Utility function for users to delete their old, read notifications.
exports.deleteReadNotifications = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const db = admin.firestore();
    const notificationsRef = db.collection("notifications");
    const query = notificationsRef.where("userId", "==", uid).where("isRead", "==", true);
    const snapshot = await query.get();

    if (snapshot.empty) {
        return { success: true, message: "No read notifications to delete." };
    }
    const batch = db.batch();
    snapshot.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    return { success: true, message: `Deleted ${snapshot.size} read notifications.` };
});

// =====================================================================
// ============ END: NOTIFICATION BADGE & PUSH SYSTEM ===================
// =====================================================================

exports.markToastAsSeen = onCall({ enforceAppCheck: false, cors: true }, async (request) => {
    if (!request.auth || !request.auth.uid) { 
        throw new HttpsError("unauthenticated", "You must be logged in."); 
    }
    const uid = request.auth.uid;
    const { notificationId } = request.data || {};
    if (!notificationId) { throw new HttpsError("invalid-argument", "Missing notificationId."); }

    const db = admin.firestore();
    try {
        const seenRef = db.doc(`creators/${uid}/seenNotifications/${notificationId}`);
        // Fix: Use the imported FieldValue from "firebase-admin/firestore" to prevent internal crash
        await seenRef.set({ seenAt: FieldValue.serverTimestamp() }, { merge: true });
        return { success: true };
    } catch (error) {
        logger.error(`Failed to mark toast ${notificationId} as seen for user ${uid}`, { error });
        throw new HttpsError("internal", "An error occurred while saving notification status.");
    }
});

// --- START: Robust, Multi-Screen Social Share Renderer (SSR) v3 ---
exports.generateSharePreviewV2 = onRequest({ cors: true }, async (request, response) => {
    const db = admin.firestore();
    const appId = "production-app-id";

    // --- 1. Define Default Meta Tags ---
    let ogTitle = "NVA Network";
    let ogDescription = "The Nexus of Viral Ascent - Discover, Compete, Connect.";
    let ogImage = "https://firebasestorage.googleapis.com/v0/b/nvanetwork-33838.appspot.com/o/public_assets%2Fsocial_share_default.png?alt=media&token=3852c062-8173-4297-8a3a-23137d6e8779";
    let debugMessage = "<!-- NVA DEBUG: Default tags were served. Path did not match a dynamic route. -->";
    
    const path = request.headers['x-original-url'] || request.path;
    const parts = path.split('/').filter(Boolean);
    const finalUrl = `https://nvanetworkapp.com${path}`;

    try {
        const screen = parts[0];
        const id = parts[1];

        if (screen === 'content' && id) {
            // First, try to find it as a standard VOD content item.
            let docSnap = await db.doc(`artifacts/${appId}/public/data/content_items/${id}`).get();
            if (docSnap.exists) {
                const data = docSnap.data();
                ogTitle = data.title;
                ogDescription = data.description;
                ogImage = data.customThumbnailUrl || data.thumbnailUrl || ogImage;
                debugMessage = `<!-- NVA DEBUG: Rendered VOD content_item: ${id} -->`;
            } else {
                // If not found, check if it's a replay from the events collection.
                docSnap = await db.doc(`events/${id}`).get();
                if (docSnap.exists && docSnap.data().status === 'completed') {
                    const data = docSnap.data();
                    ogTitle = data.eventTitle;
                    ogDescription = data.eventDescription;
                    ogImage = data.thumbnailUrl || ogImage; // Use the event's specific thumbnail
                    debugMessage = `<!-- NVA DEBUG: Rendered event replay: ${id} -->`;
                }
            }
        } else if (screen === 'opportunity' && id) {
            const docSnap = await db.doc(`opportunities/${id}`).get();
            if (docSnap.exists) {
                const data = docSnap.data();
                ogTitle = data.title;
                ogDescription = data.description;
                ogImage = data.flyerImageUrl || ogImage;
                debugMessage = `<!-- NVA DEBUG: Rendered opportunity: ${id} -->`;
            }
        } else if (screen === 'promotedStatus' && id) { // <-- NEW AD LOGIC ADDED
            const docSnap = await db.doc(`promotedStatuses/${id}`).get();
            if (docSnap.exists) {
                const data = docSnap.data().content; // Ad content is nested under 'content' field
                if (data) {
                    ogTitle = data.title;
                    ogDescription = data.description || "View this promoted ad on NVA Network.";
                    // THE FIX: Set ogImage directly to the image URL if it exists, otherwise keep the default.
                    if (data.flyerImageUrl) {
                        ogImage = data.flyerImageUrl; 
                    }
                    debugMessage = `<!-- NVA DEBUG: Rendered promoted status ad: ${id} -->`;
                }
            }
        } else if (screen === 'user' && id) {
            const docSnap = await db.doc(`creators/${id}`).get();
            if (docSnap.exists) {
                const data = docSnap.data();
                ogTitle = data.creatorName || "NVA Network Profile";
                ogDescription = data.bio || ogDescription;
                ogImage = data.profilePictureUrl || ogImage;
                debugMessage = `<!-- NVA DEBUG: Rendered user profile: ${id} -->`;
            }
      
        } else if (screen === 'competition') {
            let compDocSnap;
            if (id) {
                // If an ID is in the URL, fetch that specific competition
                compDocSnap = await db.doc(`competitions/${id}`).get();
                debugMessage = `<!-- NVA DEBUG: Attempting to render specific competition: ${id} -->`;
            } else {
                // If no ID, fall back to finding the latest active competition
                const querySnap = await db.collection("competitions").where("status", "in", ["Accepting Entries", "Live Voting"]).orderBy("createdAt", "desc").limit(1).get();
                if (!querySnap.empty) {
                    compDocSnap = querySnap.docs[0];
                    debugMessage = `<!-- NVA DEBUG: No ID found, rendered latest active competition: ${compDocSnap.id} -->`;
                }
            }
            if (compDocSnap && compDocSnap.exists) {
                const data = compDocSnap.data();
                ogTitle = data.title;
                ogDescription = data.description;
                ogImage = data.flyerImageUrl || ogImage;
            }
        } else if (screen === 'CenterStage') {
            if (id) {
                const docSnap = await db.doc(`creators/${id}`).get();
                if (docSnap.exists) {
                    const data = docSnap.data();
                    ogTitle = `Vote for ${data.creatorName} on NVA CenterStage!`;
                    ogDescription = `Support ${data.creatorName} in the NVA Docu-Series Challenges. Tap here to send a gift and cast your vote!`;
                    ogImage = data.profilePictureUrl || ogImage;
                    debugMessage = `<!-- NVA DEBUG: Rendered CenterStage contestant: ${id} -->`;
                }
            } else {
                ogTitle = "NVA CenterStage - The Docu-Series Challenges";
                ogDescription = "Step into the arena! Vote for your favorite actors, see who takes the crown, and send gifts to influence the leaderboard.";
                debugMessage = `<!-- NVA DEBUG: Rendered CenterStage Main Arena -->`;
            }
        } else if (screen === 'discover') {
            const docSnap = await db.doc("settings/liveEvent").get();
            if (docSnap.exists) {
                const data = docSnap.data();
                ogTitle = data.eventTitle || "Live Premiere Event";
                ogDescription = "Check out the latest live event on NVA Network!";
                ogImage = data.eventImageUrl || ogImage;
                debugMessage = `<!-- NVA DEBUG: Rendered live event: ${data.eventId} -->`;
            }
        }

        ogTitle = ogTitle ? ogTitle.replace(/"/g, '&quot;') : "NVA Network";
        ogDescription = ogDescription ? ogDescription.substring(0, 150).replace(/"/g, '&quot;') + '...' : "The Nexus of Viral Ascent - Discover, Compete, Connect.";

    } catch (error) {
        logger.error(`Error fetching social preview for path '${path}':`, error);
        debugMessage = `<!-- NVA DEBUG: A database error occurred: ${error.message} -->`;
    }

    // TEMPORARY DEBUG LOG: Log the final tags before they are rendered into HTML
    logger.info(`[DEBUG SSR] FINAL TAGS`, { ogTitle, ogDescription, ogImage, finalUrl, debugMessage });

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"><title>${ogTitle}</title>${debugMessage}
        <meta property="og:title" content="${ogTitle}" />
        <meta property="og:description" content="${ogDescription}" />
        <meta property="og:image" content="${ogImage}" />
        <meta property="og:url" content="${finalUrl}" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <script>window.location.href = "${finalUrl}";</script>
      </head>
      <body><p>${ogDescription}</p></body>
      </html>`;

    response.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    response.status(200).send(html);
});
// =====================================================================
// ======================= NVA ENROLLMENT SYSTEM =======================
// =====================================================================

// Callable function for a user to submit their enrollment application.
exports.submitEnrollmentApplication = onCall({ enforceAppCheck: false }, async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to apply.");
    }
    const { selectedOptions, totalAmount, phoneNumber } = request.data; 
    if (!selectedOptions || !Array.isArray(selectedOptions) || selectedOptions.length === 0) {
        throw new HttpsError("invalid-argument", "You must select at least one program.");
    }

    const db = admin.firestore();
    const userRef = db.doc(`creators/${uid}`);
    const enrollmentRef = db.doc(`enrollmentApplications/${uid}`);
    const configRef = db.doc('settings/enrollmentConfig');

    try {
        const [userDoc, enrollmentDoc, configDoc] = await Promise.all([
            userRef.get(),
            enrollmentRef.get(),
            configRef.get()
        ]);

        if (!userDoc.exists) {
            throw new HttpsError("not-found", "Your user profile could not be found.");
        }

        const userData = userDoc.data();
        const config = configDoc.data();
        // DEFINITIVE FIX: Check track-specific cooldowns instead of global blocks
        const userCooldowns = userData.cooldowns || {};
        for (const option of selectedOptions) {
            if (userCooldowns[option]) {
                const cooldownTime = new Date(userCooldowns[option]).getTime();
                if (!isNaN(cooldownTime) && Date.now() < cooldownTime) {
                    const remainingDays = Math.ceil((cooldownTime - Date.now()) / (24 * 60 * 60 * 1000));
                    throw new HttpsError("failed-precondition", `Your profile is on a cooldown hold for ${option === 'filmClub' ? 'Film Club' : 'Docu-Series'}. You can apply again in ${remainingDays} day(s).`);
                }
            }
        }
        
        // Fallback for legacy global hold
        if (userData.cooldownUntil) {
            const cooldownTime = new Date(userData.cooldownUntil).getTime();
            if (!isNaN(cooldownTime) && Date.now() < cooldownTime) {
                const remainingDays = Math.ceil((cooldownTime - Date.now()) / (24 * 60 * 60 * 1000));
                throw new HttpsError("failed-precondition", `Your profile is on a global cooldown hold. You can apply again in ${remainingDays} day(s).`);
            }
        }
        
        // --- Check 3-Day & 30-Day Holds on Rejection or Deletion ---
        if (enrollmentDoc.exists) {
            const appData = enrollmentDoc.data();
            const existingOpts = appData.selectedOptions || [];
            const history = appData.history || [];
            
            // Check if the user is adding any brand-new program options they haven't applied for yet
            const isNewOptionSelected = selectedOptions.some(opt => !existingOpts.includes(opt));
            
            if (!isNewOptionSelected) {
                const lastHistoryEntry = history[history.length - 1];
                const isHoldCleared = lastHistoryEntry && lastHistoryEntry.status === "hold_cleared";

                if (!isHoldCleared) {
                    const wasPreviouslyApprovedOrEnrolled = history.some(h => h.status === "approved" || h.status === "enrolled" || h.status === "paymentPending");
                    
                    // ARCHITECTURAL FIX: Decoupled check. Only block if the SPECIFIC track being requested is in declinedOptions.
                    const isGlobalHoldStatus = ["declined", "cancelled", "revoked"].includes(appData.status);
                    const declinedOpts = appData.declinedOptions || [];
                    const isTargetTrackLocked = selectedOptions.some(opt => declinedOpts.includes(opt));

                    if (isGlobalHoldStatus && isTargetTrackLocked) {
                        const lastUpdateTime = appData.updatedAt 
                            ? (appData.updatedAt.toDate ? appData.updatedAt.toDate().getTime() : new Date(appData.updatedAt).getTime())
                            : (appData.declinedAt ? (appData.declinedAt.toDate ? appData.declinedAt.toDate().getTime() : new Date(appData.declinedAt).getTime()) : Date.now());
                        
                        const cooldownMs = wasPreviouslyApprovedOrEnrolled ? (30 * 24 * 60 * 60 * 1000) : (3 * 24 * 60 * 60 * 1000);
                        const timeElapsed = Date.now() - lastUpdateTime;

                        if (timeElapsed < cooldownMs) {
                            const remainingTime = cooldownMs - timeElapsed;
                            const remainingDays = Math.ceil(remainingTime / (24 * 60 * 60 * 1000));
                            throw new HttpsError("failed-precondition", `The selected track is on a ${wasPreviouslyApprovedOrEnrolled ? '30' : '3'}-day hold. You can reapply in ${remainingDays} day(s).`);
                        }
                    } else if (!isGlobalHoldStatus) {
                        // If status is active (pending/approved), only block if they are trying to re-apply for the exact same track
                        const isAlreadyActive = selectedOptions.some(opt => existingOpts.includes(opt));
                        if (isAlreadyActive) {
                            throw new HttpsError("already-exists", "You already have an active pending or approved application for this selection.");
                        }
                    }
                }
            }
        }

        if (!configDoc.exists) {
            throw new HttpsError("failed-precondition", "Enrollment configuration is not available.");
        }

        const bioText = userData.bio || ""; // <-- PREVENT UNDEFINED ERROR

        // --- Profile Completeness Validation ---
        if (config.requireProfilePhoto && !userData.profilePictureUrl) {
            throw new HttpsError("failed-precondition", "A profile picture is required to apply.");
        }
        if (config.requirePhone && !phoneNumber) { 
            throw new HttpsError("failed-precondition", "A phone number is required to apply.");
        }
        if (config.requireExperience && (!bioText || bioText.length < 10)) {
            throw new HttpsError("failed-precondition", "Your bio/experience is required (minimum 10 characters).");
        }

        // DEFINITIVE FIX: Safely pull email from Auth Token, preventing crashes if 'email' is missing in Firestore
        const userAuthEmail = request.auth.token.email || userData.email || "";
        const fallbackName = userAuthEmail ? userAuthEmail.split('@')[0] : "Applicant";

        const applicationData = {
            userId: uid,
            userName: userData.creatorName || fallbackName,
            userEmail: userAuthEmail || "No Email Provided",
            profilePictureUrl: userData.profilePictureUrl || null,
            phone: phoneNumber || null,
            bio: bioText,
            selectedOptions,
            totalAmount: totalAmount || 0,
            status: "pending",
            submittedAt: admin.firestore.FieldValue.serverTimestamp(),
            history: [{
                status: "pending",
                timestamp: new Date().toISOString(),
                actor: "user"
            }]
        };

        await enrollmentRef.set(applicationData, { merge: true });
        logger.info(`User '${uid}' successfully submitted an enrollment application.`);
        return { success: true, message: "Application submitted for review." };

    } catch (error) {
        logger.error(`Error in submitEnrollmentApplication for user '${uid}':`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred.");
    }
});

// Admin/Moderator function to bestow or revoke "Gold Club" status (Lifetime Exemption)
exports.toggleGoldClubStatus = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");
    const db = admin.firestore();
    
    // Auth Check: Staff roles only (Super Admin, Admin, Authority, Moderator)
    const callerSnap = await db.doc(`creators/${request.auth.uid}`).get();
    const callerData = callerSnap.data();
    const allowedRoles = ['admin', 'authority', 'super_admin', 'moderator'];
    if (!callerSnap.exists || !allowedRoles.includes(callerData.role)) {
        throw new HttpsError("permission-denied", "Unauthorized.");
    }

    const { targetUserId } = request.data;
    const userRef = db.doc(`creators/${targetUserId}`);
    const userSnap = await userRef.get();

    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const userData = userSnap.data();
    const currentBadges = userData.badges || [];
    const isGold = currentBadges.includes("Gold Club");

    let newBadges;
    if (isGold) {
        newBadges = currentBadges.filter(b => b !== "Gold Club");
    } else {
        newBadges = [...currentBadges, "Gold Club"];
    }

    const appRef = db.doc(`enrollmentApplications/${targetUserId}`);
    const appSnap = await appRef.get();

    let userUpdates = { badges: newBadges };
    let appUpdates = { badges: newBadges };

    // INSTANT ENROLLMENT JUMP: If turning Gold ON, bypass the enrollment steps for Film Club
    if (!isGold) {
        // Set flags on User Profile
        userUpdates.isFilmClub = true;
        userUpdates.isClassMember = true;
        
        // Set a 30-day expiry placeholder (Cron job will ignore them anyway because of the Gold badge)
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        userUpdates.subscriptionExpiresAt = expiryDate.toISOString();

        // Update Application Status to Enrolled ONLY if Film Club is the only thing they are doing
        if (appSnap.exists) {
            const appData = appSnap.data();
            const currentOpts = appData.selectedOptions || [];
            
            // ARCHITECTURAL FIX: If they have Docu-Series, keep status 'pending' so they must pay.
            const hasOtherTracks = currentOpts.some(opt => opt !== 'filmClub');
            if (!hasOtherTracks) {
                appUpdates.status = "enrolled";
            }
            
            if (!currentOpts.includes('filmClub')) {
                appUpdates.selectedOptions = [...currentOpts, 'filmClub'];
            }
            appUpdates.history = admin.firestore.FieldValue.arrayUnion({
                status: "enrolled_via_gold",
                timestamp: new Date().toISOString(),
                actor: request.auth.uid
            });
        }
    }

    // Execute updates
    await userRef.update(userUpdates);
    if (appSnap.exists) {
        await appRef.update(appUpdates);
    }
    
    logger.info(`Admin '${request.auth.uid}' bestowed Gold Status & Enrolled user '${targetUserId}'.`);
    return { success: true, isGold: !isGold };
});

// Admin-only function to approve an application.
exports.approveEnrollmentApplication = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    
    const db = admin.firestore();
    
    // THE FIX: Robust Admin Check via Database to prevent Token Crashes (CORS errors)
    const callerRef = db.doc(`creators/${request.auth.uid}`);
    const callerSnap = await callerRef.get();
    const allowedRoles = ['admin', 'authority', 'super_admin', 'moderator'];
    if (!callerSnap.exists || !allowedRoles.includes(callerSnap.data().role)) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }

    const { targetUserId } = request.data;
    if (!targetUserId) {
        throw new HttpsError("invalid-argument", "Missing targetUserId.");
    }

    const enrollmentRef = db.doc(`enrollmentApplications/${targetUserId}`);
    await enrollmentRef.update({
        status: "approved",
        history: admin.firestore.FieldValue.arrayUnion({
            status: "approved",
            timestamp: new Date().toISOString(),
            actor: request.auth.uid
        })
    });
    
    logger.info(`Admin '${request.auth.uid}' approved enrollment for user '${targetUserId}'.`);
    return { success: true };
});

// Admin-only function to decline an application.
exports.declineEnrollmentApplication = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    const db = admin.firestore();
    const callerRef = db.doc(`creators/${request.auth.uid}`);
    const callerSnap = await callerRef.get();
    const allowedRoles = ['admin', 'authority', 'super_admin', 'moderator'];
    if (!callerSnap.exists || !allowedRoles.includes(callerSnap.data().role)) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }

    const { targetUserId, reason } = request.data;
    if (!targetUserId) throw new HttpsError("invalid-argument", "Missing targetUserId.");

    const enrollmentRef = db.doc(`enrollmentApplications/${targetUserId}`);
    const userRef = db.doc(`creators/${targetUserId}`);

    const appSnap = await enrollmentRef.get();
    const userSnap = await userRef.get();

    // Set 3-day hold for specifically requested tracks
    const cooldownMs = 3 * 24 * 60 * 60 * 1000;
    const cooldownTimestamp = new Date(Date.now() + cooldownMs).toISOString();
    
    let newCooldowns = userSnap.exists ? (userSnap.data().cooldowns || {}) : {};
    if (appSnap.exists && userSnap.exists) {
        const uData = userSnap.data();
        const opts = appSnap.data().selectedOptions || [];
        opts.forEach(opt => {
            // SAFEGUARD: Do not apply a decline hold to any track they are ALREADY a member of!
            if (opt === 'filmClub' && (uData.isFilmClub || uData.isClassMember)) return;
            if (opt === 'docuSeries' && uData.isContestant) return;
            
            newCooldowns[opt] = cooldownTimestamp;
        });
    }

    await userRef.update({
        cooldowns: newCooldowns
    });

    await enrollmentRef.update({
        status: "declined",
        declinedAt: admin.firestore.FieldValue.serverTimestamp(),
        history: admin.firestore.FieldValue.arrayUnion({
            status: "declined",
            timestamp: new Date().toISOString(),
            actor: request.auth.uid,
            reason: reason || null
        })
    });

    logger.info(`Admin '${request.auth.uid}' declined enrollment for user '${targetUserId}'.`);
    return { success: true };
});

// Admin-only function to clear the 3-day or 30-day hold on ANY declined/revoked application.
exports.clearEnrollmentHold = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    const db = admin.firestore();
    const callerRef = db.doc(`creators/${request.auth.uid}`);
    const callerSnap = await callerRef.get();
    const allowedRoles = ['admin', 'authority', 'super_admin', 'moderator'];
    if (!callerSnap.exists || !allowedRoles.includes(callerSnap.data().role)) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }

    const { targetUserId } = request.data;
    if (!targetUserId) throw new HttpsError("invalid-argument", "Missing targetUserId.");

    const enrollmentRef = db.doc(`enrollmentApplications/${targetUserId}`);
    const userRef = db.doc(`creators/${targetUserId}`); // <-- FIXED TYPO (db.doc)

    // 1. Physically remove all lockdowns, ghost badges, and active flags to reset the user
    try {
        const uSnap = await userRef.get();
        const uData = uSnap.data();
        const cleanBadges = (uData.badges || []).filter(b => b !== "Film Club" && b !== "Class Member" && b !== "Contestant" && b !== "Gold Club");

        await userRef.update({
            cooldowns: admin.firestore.FieldValue.delete(),
            cooldownUntil: admin.firestore.FieldValue.delete(),
            isFilmClub: false,
            isClassMember: false,
            isContestant: false,
            badges: cleanBadges
        });
    } catch (e) {
        // Silently ignore if fields don't exist
    }

    // 2. Safely set application to cancelled using MERGE so it resurrects missing Ghost documents!
    await enrollmentRef.set({
        status: "cancelled",
        declinedAt: admin.firestore.FieldValue.delete(),
        declinedOptions: admin.firestore.FieldValue.delete(),
        hasRevokedTrack: admin.firestore.FieldValue.delete(),
        hasDeclinedTrack: admin.firestore.FieldValue.delete(),
        history: admin.firestore.FieldValue.arrayUnion({
            status: "hold_cleared",
            timestamp: new Date().toISOString(),
            actor: request.auth.uid
        })
    }, { merge: true });

    logger.info(`Admin '${request.auth.uid}' cleared enrollment hold for user '${targetUserId}'.`);
    return { success: true };
});

// God-Tier Revoke: Handles track isolation, Gold stripping, visibility flags, and the set/merge VIP safety fix.
exports.deleteEnrollmentApplication = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");
    const db = admin.firestore();
    const callerSnap = await db.doc(`creators/${request.auth.uid}`).get();
    const allowedRoles = ['admin', 'authority', 'super_admin', 'moderator'];
    if (!callerSnap.exists || !allowedRoles.includes(callerSnap.data().role)) {
        throw new HttpsError("permission-denied", "Access Denied.");
    }

    const { targetUserId, program } = request.data; 
    if (!targetUserId || !program) throw new HttpsError("invalid-argument", "Missing User ID or Program.");

    const userRef = db.doc(`creators/${targetUserId}`);
    const enrollmentRef = db.doc(`enrollmentApplications/${targetUserId}`);
    const [userSnap, appSnap] = await Promise.all([userRef.get(), enrollmentRef.get()]);

    let cooldownMs = 3 * 24 * 60 * 60 * 1000;
    if (appSnap.exists) {
        const history = appSnap.data().history || [];
        if (history.some(h => h.status === "enrolled" || h.status === "approved")) {
            cooldownMs = 30 * 24 * 60 * 60 * 1000;
        }
    }

    let filteredBadges = [];
    if (userSnap.exists) {
        const uData = userSnap.data();
        filteredBadges = uData.badges || [];
        let updates = {};

        const revokeFilm = program === 'filmClub' || program === 'all';
        const revokeDocu = program === 'docuSeries' || program === 'all';

        if (revokeFilm) {
            updates.isClassMember = false;
            updates.isFilmClub = false;
            // ARCHITECTURAL SYNC: Gold Club is stripped whenever Film Club is revoked.
            filteredBadges = filteredBadges.filter(b => b !== "Film Club" && b !== "Class Member" && b !== "Gold Club");
        }
        if (revokeDocu) {
            updates.isContestant = false;
            filteredBadges = filteredBadges.filter(b => b !== "Contestant");
        }

        updates.badges = filteredBadges;
        const currentCooldowns = uData.cooldowns || {};
        const expiry = new Date(Date.now() + cooldownMs).toISOString();
        if (program === 'all') {
            ['filmClub', 'docuSeries'].forEach(opt => currentCooldowns[opt] = expiry);
        } else {
            currentCooldowns[program] = expiry;
        }
        updates.cooldowns = currentCooldowns;
        await userRef.update(updates);
    }

    // SYNC APPLICATION DOC: Calculate logic for "Revoked Members" tab visibility
    const appData = appSnap.exists ? appSnap.data() : { selectedOptions: [], history: [], status: 'none' };
    const wasPreviouslyEnrolled = appData.status === 'enrolled' || appData.history?.some(h => h.status === 'enrolled');

    let newSelected = (appData.selectedOptions || []);
    let declinedOpts = (appData.declinedOptions || []);
    let newStatus = appData.status;

    if (program === 'all') {
        declinedOpts = Array.from(new Set([...declinedOpts, ...newSelected]));
        newSelected = [];
        newStatus = wasPreviouslyEnrolled ? 'revoked' : 'declined';
    } else {
        newSelected = newSelected.filter(opt => opt !== program);
        if (!declinedOpts.includes(program)) declinedOpts.push(program);
        if (newSelected.length === 0) {
            newStatus = wasPreviouslyEnrolled ? 'revoked' : 'declined';
        }
    }

    let appUpdates = {
        status: newStatus,
        selectedOptions: newSelected,
        declinedOptions: declinedOpts,
        badges: filteredBadges,
        declinedAt: admin.firestore.FieldValue.serverTimestamp(),
        history: admin.firestore.FieldValue.arrayUnion({
            status: newStatus === appData.status ? `revoked_${program}` : newStatus,
            timestamp: new Date().toISOString(),
            actor: request.auth.uid
        })
    };

    if (wasPreviouslyEnrolled) appUpdates.hasRevokedTrack = true;
    else appUpdates.hasDeclinedTrack = true;

    // DEFINITIVE FIX: Use SET with MERGE to handle Gold VIPs who skipped the application doc creation.
    await enrollmentRef.set(appUpdates, { merge: true });

    return { success: true };
});

// Callable function for a user to submit their payment details (Saves base64 directly to GCS).
exports.submitEnrollmentPayment = onCall({ enforceAppCheck: false }, async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const { paymentId, screenshotBase64 } = request.data;
    if (!paymentId || !screenshotBase64) {
        throw new HttpsError("invalid-argument", "Missing payment ID or screenshot payload.");
    }
    
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const enrollmentRef = db.doc(`enrollmentApplications/${uid}`);

    try {
        const mimeTypeMatch = screenshotBase64.match(/^data:(image\/\w+);base64,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
        const extension = mimeType.split('/')[1] || 'png';
        const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        const filePath = `enrollment_payments/${uid}/payment_proof_${Date.now()}.${extension}`;
        const file = bucket.file(filePath);

        await file.save(buffer, {
            metadata: { contentType: mimeType },
            public: true
        });

        const screenshotUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

        await enrollmentRef.update({
            status: "paymentPending",
            paymentDetails: {
                paymentId,
                screenshotUrl,
                submittedAt: new Date().toISOString()
            },
            history: admin.firestore.FieldValue.arrayUnion({
                status: "paymentPending",
                timestamp: new Date().toISOString(),
                actor: "user"
            })
        });

        logger.info(`User '${uid}' successfully submitted payment details.`);
        return { success: true, verified: false };

    } catch (error) {
        logger.error(`Error in submitEnrollmentPayment for user '${uid}':`, error);
        throw new HttpsError("internal", error.message);
    }
});

// Admin-only function to verify a payment and enroll the user.
exports.verifyEnrollmentPayment = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");
    
    const db = admin.firestore();
    
    // THE FIX: Robust Admin Check via Database to bypass custom claim token crashes
    const callerSnap = await db.doc(`creators/${request.auth.uid}`).get();
    const allowedRoles = ['admin', 'authority', 'super_admin', 'moderator'];
    if (!callerSnap.exists || !allowedRoles.includes(callerSnap.data().role)) {
        throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }

    const { targetUserId } = request.data;
    if (!targetUserId) {
        throw new HttpsError("invalid-argument", "Missing targetUserId.");
    }

    const enrollmentRef = db.doc(`enrollmentApplications/${targetUserId}`);

    await enrollmentRef.update({
        status: "enrolled",
        history: admin.firestore.FieldValue.arrayUnion({
            status: "enrolled",
            timestamp: new Date().toISOString(),
            actor: request.auth.uid
        })
    });

    logger.info(`Admin '${request.auth.uid}' verified payment and enrolled user '${targetUserId}'.`);
    return { success: true };
});

// Firestore trigger that handles both badge synchronization on enrollment AND profile-cleaning on removal
exports.onEnrollmentUpdated = onDocumentUpdated("enrollmentApplications/{userId}", async (event) => {
    const dataBefore = event.data.before.data();
    const dataAfter = event.data.after.data();
    const userId = event.params.userId;
    const db = admin.firestore();
    const userRef = db.doc(`creators/${userId}`);

    // Case 1: Status changed TO 'enrolled' (Additive Sync)
    if (dataBefore.status !== "enrolled" && dataAfter.status === "enrolled") {
        try {
            const opts = dataAfter.selectedOptions || [];
            const userSnap = await userRef.get();
            const currentBadges = userSnap.exists ? (userSnap.data().badges || []) : [];
            
            let updates = { cooldownUntil: admin.firestore.FieldValue.delete() };
            let newBadges = [...currentBadges];

            // Only add Film Club if it's in the CURRENT application options
            if (opts.includes("filmClub")) {
                updates.isClassMember = true;
                updates.isFilmClub = true;
                // Set initial subscription for 30 days
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + 30);
                updates.subscriptionExpiresAt = expiryDate.toISOString();
                
                if (!newBadges.includes("Film Club")) newBadges.push("Film Club");
                if (!newBadges.includes("Class Member")) newBadges.push("Class Member");
            }
            
            // Only add Contestant if it's in the CURRENT application options
            if (opts.includes("docuSeries")) {
                updates.isContestant = true;
                if (!newBadges.includes("Contestant")) newBadges.push("Contestant");
            }

            updates.badges = newBadges;
            await userRef.update(updates);
            
            // DEFINITIVE FIX: Non-destructive Custom Claims update
            const userRecord = await admin.auth().getUser(userId);
            const currentClaims = userRecord.customClaims || {};
            await admin.auth().setCustomUserClaims(userId, { ...currentClaims, classMember: true });
        } catch (error) {
            logger.error(`Error syncing enrollment: ${error.message}`);
        }
    }

    // We intentionally removed Case 2 (Destructive Removal) here. 
    // Revocations and badge stripping are now handled exclusively and safely by the 
    // deleteEnrollmentApplication and clearEnrollmentHold admin functions.
    
    return null;
});

// Firestore trigger that cleans profiles and enforces the 30-day cooldown if an enrollment is deleted entirely
exports.onEnrollmentDeleted = onDocumentDeleted("enrollmentApplications/{userId}", async (event) => {
    const userId = event.params.userId;
    const deletedData = event.data.data();
    const db = admin.firestore();
    const userRef = db.doc(`creators/${userId}`);

    logger.info(`Enrollment application for '${userId}' was deleted. Clearing profile and enforcing cooldown.`);

    try {
        const history = deletedData.history || [];
        const wasPreviouslyEnrolled = history.some(h => h.status === "enrolled");
        const cooldownMs = wasPreviouslyEnrolled ? (30 * 24 * 60 * 60 * 1000) : (3 * 24 * 60 * 60 * 1000);

        const userSnap = await userRef.get();
        if (userSnap.exists) {
            const currentBadges = userSnap.data().badges || [];
            // ARCHITECTURAL SYNC: Strip Gold Club during hard deletion of enrollment records
            const filteredBadges = currentBadges.filter(b => b !== "Film Club" && b !== "Class Member" && b !== "Contestant" && b !== "Gold Club");
            
            // Apply track-specific cooldowns to any options that were in the deleted document
            const currentCooldowns = userSnap.data().cooldowns || {};
            const opts = deletedData.selectedOptions || [];
            const cooldownTimestamp = new Date(Date.now() + cooldownMs).toISOString();
            opts.forEach(opt => {
                currentCooldowns[opt] = cooldownTimestamp;
            });

            const updates = {
                isClassMember: false,
                isFilmClub: false,
                isContestant: false,
                badges: filteredBadges,
                cooldowns: currentCooldowns
            };
            
            await userRef.update(updates);
        }

        // DEFINITIVE FIX: Non-destructive Custom Claims update
        const userRecord = await admin.auth().getUser(userId);
        const currentClaims = userRecord.customClaims || {};
        await admin.auth().setCustomUserClaims(userId, { ...currentClaims, classMember: false });
    } catch (error) {
        logger.error(`Failed to clean up deleted enrollment for '${userId}':`, error);
    }
    return null;
});

// Admin-only function to retrieve a list of applications with hybrid status/flag support.
exports.getEnrollmentApplications = onCall({ enforceAppCheck: false, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");
    const db = admin.firestore();
    const callerSnap = await db.doc(`creators/${request.auth.uid}`).get();
    const allowedRoles = ['admin', 'authority', 'super_admin', 'moderator'];
    if (!callerSnap.exists || !allowedRoles.includes(callerSnap.data().role)) {
        throw new HttpsError("permission-denied", "Access Denied.");
    }

    const { statusFilter } = request.data;
    let results = [];

    if (statusFilter === 'revoked' || statusFilter === 'declined') {
        const flagField = statusFilter === 'revoked' ? 'hasRevokedTrack' : 'hasDeclinedTrack';
        const [snap1, snap2] = await Promise.all([
            db.collection('enrollmentApplications').where('status', '==', statusFilter).get(),
            db.collection('enrollmentApplications').where(flagField, '==', true).get()
        ]);
        const merged = new Map();
        snap1.docs.forEach(d => merged.set(d.id, { id: d.id, ...d.data() }));
        snap2.docs.forEach(d => merged.set(d.id, { id: d.id, ...d.data() }));
        results = Array.from(merged.values());
    } else if (statusFilter && statusFilter !== 'all') {
        const snap = await db.collection('enrollmentApplications').where('status', '==', statusFilter).get();
        results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
        const snap = await db.collection('enrollmentApplications').get();
        results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    results.sort((a, b) => {
        const tA = a.submittedAt ? (a.submittedAt.toDate ? a.submittedAt.toDate().getTime() : new Date(a.submittedAt).getTime()) : 0;
        const tB = b.submittedAt ? (b.submittedAt.toDate ? b.submittedAt.toDate().getTime() : new Date(b.submittedAt).getTime()) : 0;
        return tB - tA;
    });

    return { applications: results.slice(0, 50) };
});

// Admin-only function to update global enrollment settings securely
exports.updateEnrollmentConfig = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Unauthenticated.");
    const db = admin.firestore();
    const callerSnap = await db.doc(`creators/${request.auth.uid}`).get();
    const allowedRoles = ['admin', 'authority', 'super_admin', 'moderator'];
    if (!callerSnap.exists || !allowedRoles.includes(callerSnap.data().role)) {
        throw new HttpsError("permission-denied", "Unauthorized.");
    }

    const { newConfig } = request.data;
    await db.doc('settings/enrollmentConfig').set(newConfig, { merge: true });
    
    logger.info(`Admin '${request.auth.uid}' updated global enrollment configurations.`);
    return { success: true };
});

// =====================================================================
// ============ START: CENTERSTAGE ADMIN MANAGEMENT ====================
// =====================================================================

exports.updateCenterStageContestant = onCall({ enforceAppCheck: false, cors: ["*"] }, async (request) => {
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.authority)) {
        throw new HttpsError("permission-denied", "Unauthorized: Only admins or authorities can manage CenterStage.");
    }

    const { targetUserId, action, payload } = request.data || {};
    if (!targetUserId || !action) {
        throw new HttpsError("invalid-argument", "Missing target ID or action.");
    }

    const db = admin.firestore();
    const userRef = db.doc(`creators/${targetUserId}`);

    try {
        const docSnap = await userRef.get();
        if (!docSnap.exists) {
            throw new HttpsError("not-found", "Target contestant profile does not exist.");
        }

        if (action === 'eliminate') {
            await userRef.update({ isEliminated: true, competitionStatus: 'eliminated' });
        } 
        else if (action === 'reinstate') {
            await userRef.update({ isEliminated: false, competitionStatus: 'active' });
        } 
        else if (action === 'update_media') {
            await userRef.update({ 
                currentChallengeLink: payload?.challengeLink || '',
                currentChallengeThumbnail: payload?.customThumbnailUrl || '' 
            });
        } 
        else if (action === 'assign_team') {
            const cleanTag = payload?.teamTag ? payload.teamTag.trim() : '';
            await userRef.update({ teamTag: cleanTag });
        }

        logger.info(`User '${request.auth.uid}' performed '${action}' on contestant '${targetUserId}'.`);
        return { success: true, message: `Contestant successfully updated.` };

    } catch (error) {
        logger.error(`Error managing contestant '${targetUserId}':`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An error occurred while updating the contestant.");
    }
});

exports.resetCenterStageVotes = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth || request.auth.token.admin !== true) {
        throw new HttpsError("permission-denied", "Only Admins can perform a global vote reset.");
    }

    const db = admin.firestore();
    try {
        const contestantsSnap = await db.collection("creators").where("isContestant", "==", true).get();
        if (contestantsSnap.empty) return { success: true, message: "No contestants found." };

        const batch = db.batch();
        let resetCount = 0;

        contestantsSnap.forEach(doc => {
            // Fix: Safely delete the gift map instead of wiping it with {} which causes map structural errors
            batch.update(doc.ref, { 
                voteCount: 0, 
                giftInventory: admin.firestore.FieldValue.delete() 
            });
            resetCount++;
        });

        await batch.commit();
        logger.info(`Admin '${request.auth.uid}' reset votes for ${resetCount} contestants.`);
        return { success: true, message: `Successfully reset votes for ${resetCount} contestants for the new round.` };

    } catch (error) {
        logger.error("Error resetting CenterStage votes:", error);
        throw new HttpsError("internal", "Failed to reset votes.");
    }
});

exports.updateGlobalChallengeMedia = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.authority)) {
        throw new HttpsError("permission-denied", "Unauthorized.");
    }
    const { challengeLink, customThumbnailUrl } = request.data || {};
    const db = admin.firestore();
    try {
        await db.doc("settings/competitionDisplayState").set({
            globalChallengeLink: challengeLink || '',
            globalChallengeThumbnail: customThumbnailUrl || ''
        }, { merge: true });
        return { success: true };
    } catch (error) {
        logger.error("Error updating global media:", error);
        throw new HttpsError("internal", "Failed to update global media.");
    }
});

// =====================================================================
// =========== AUTOMATED DAILY PLATFORM MAINTENANCE SYSTEM =============
// =====================================================================
exports.dailySystemMaintenance = onSchedule("0 3 * * *", async (event) => {
    logger.info("Executing scheduled daily platform maintenance...");
    const db = admin.firestore();
    const creatorsRef = db.collection("creators");
    const today = new Date();
    const isMonday = today.getDay() === 1;

    // 1. Reset Daily/Weekly Stats
    try {
        const snapshot = await creatorsRef.get();
        if (!snapshot.empty) {
            const batch = db.batch();
            snapshot.forEach(doc => {
                const updates = { dailyViews: 0, dailyLikes: 0 };
                if (isMonday) {
                    updates.weeklyViews = 0;
                    updates.weeklyLikes = 0;
                }
                batch.update(doc.ref, updates);
            });
            await batch.commit();
            logger.info(`Reset stats for ${snapshot.size} creators.`);
        }
    } catch (err) { logger.error("Error resetting stats:", err); }

    // 2. Update Top Performers
    try { 
        await runTopPerformersUpdate(); 
        logger.info("Top performers refreshed.");
    } catch (err) { logger.error("Error updating top performers:", err); }

    // 3. Update Platform Stats
    try { 
        await runPlatformStatsAggregation(); 
        logger.info("Platform statistics refreshed.");
    } catch (err) { logger.error("Error updating platform stats:", err); }

    // 4. Prune User Feeds (Weekly prune to keep indices low)
    try { 
        await runFeedPruning(); 
        logger.info("User feeds pruned.");
    } catch (err) { logger.error("Error pruning user feeds:", err); }

    // 5. Purge Completed Events and Movies older than 7 Days [1]
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Retrieve and delete completed events
        const oldEventsSnap = await db.collection("events")
            .where("status", "==", "completed")
            .where("scheduledEndTime", "<=", sevenDaysAgo)
            .get();
        if (!oldEventsSnap.empty) {
            for (const doc of oldEventsSnap.docs) {
                await doc.ref.delete(); // Triggers onEventDeleted recursive cleanup [1]
            }
        }

        // Retrieve and delete old movies matching those events
        const oldEventIds = oldEventsSnap.docs.map(doc => doc.id);
        if (oldEventIds.length > 0) {
            const oldMoviesSnap = await db.collection("movies")
                .where("__name__", "in", oldEventIds.slice(0, 10))
                .get();
            for (const doc of oldMoviesSnap.docs) {
                await doc.ref.delete(); // Triggers onMovieDeleted recursive cleanup [1]
            }
        }
    } catch (err) { logger.error("Error purging old completed events:", err); }

    // 6. Cleanup Expired Subscriptions (Grace-Period Awareness)
    try {
        const gracePeriodMs = 3 * 24 * 60 * 60 * 1000;
        const expiredUsersSnap = await db.collection('creators')
            .where('isFilmClub', '==', true)
            .where('subscriptionExpiresAt', '<', today.toISOString())
            .get();

        if (!expiredUsersSnap.empty) {
            const batch = db.batch();
            expiredUsersSnap.forEach(doc => {
                const userData = doc.data();
                if (userData.badges?.includes("Gold Club")) return;
                const expiry = new Date(userData.subscriptionExpiresAt).getTime();
                if (Date.now() > (expiry + gracePeriodMs)) {
                    const filteredBadges = (userData.badges || []).filter(b => b !== "Film Club" && b !== "Class Member");
                    const currentCooldowns = userData.cooldowns || {};
                    const cooldownDate = new Date();
                    cooldownDate.setDate(cooldownDate.getDate() + 30);
                    currentCooldowns['filmClub'] = cooldownDate.toISOString();

                    batch.update(doc.ref, {
                        isClassMember: false,
                        isFilmClub: false,
                        badges: filteredBadges,
                        cooldowns: currentCooldowns,
                        lastSubscriptionStatus: 'expired_and_revoked'
                    });

                    const appRef = db.doc(`enrollmentApplications/${doc.id}`);
                    batch.update(appRef, { 
                        status: 'revoked', 
                        hasRevokedTrack: true,
                        declinedOptions: admin.firestore.FieldValue.arrayUnion('filmClub')
                    });
                }
            });
            await batch.commit();
            logger.info(`Cleaned up expired subscriptions.`);
        }
    } catch (err) { logger.error("Error cleaning expired subscriptions:", err); }

    return null;
});

// --- SECURE MONETIZATION SNAPSHOT & NOTIFICATION ENGINE ---
exports.onMonetizationStatusChange = onDocumentUpdated("artifacts/{appId}/public/data/content_items/{contentId}", async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    // 1. Guard: Only run if status physically changed
    if (before.monetizationStatus === after.monetizationStatus) return null;

    const db = admin.firestore();
    const creatorId = after.creatorId;
    if (!creatorId) return null;

    let notification = null;

    // 2. Logic: Handle Approved State (Securely dispatch notification)
    if (after.monetizationStatus === 'approved') {
        
        // === THE 1-MONETIZED-VIDEO-LIMIT FIX ===
        try {
            const contentRef = db.collection(`artifacts/${event.params.appId}/public/data/content_items`);
            
            // Find any OTHER monetized videos by this creator and strip the monetization badge
            const otherMonetizedSnap = await contentRef
                .where("creatorId", "==", creatorId)
                .where("monetizationStatus", "==", "approved")
                .get();
            
            if (!otherMonetizedSnap.empty) {
                const batch = db.batch();
                otherMonetizedSnap.forEach(docSnap => {
                    if (docSnap.id !== event.params.contentId) {
                        // Strip monetization from old content, but DO NOT touch their Showcase/isFeatured status!
                        batch.update(docSnap.ref, { monetizationStatus: 'none', isMonetizationRequest: false });
                    }
                });
                await batch.commit();
            }
            
            // We DO NOT auto-publish or alter isFeatured. The user has full control over their showcase!
        } catch (err) {
            logger.error(`Monetization cleanup failed for ${creatorId}:`, err);
        }

        notification = {
            userId: creatorId,
            title: "Video Approved & Live! 🎬",
            body: `Your video "${after.title}" has been approved for monetization and is now live!`,
            link: "/CreatorDashboard",
            deliveryType: ["inbox", "push"],
            notificationType: "MONETIZATION_APPROVED",
            timestamp: FieldValue.serverTimestamp() // SYNCED TO YOUR IMPORTS
        };
    } 
    // 3. Logic: Handle Rejected State
    else if (after.monetizationStatus === 'rejected') {
        notification = {
            userId: creatorId,
            title: "Monetization Update",
            body: `Your monetization request for "${after.title}" was not approved. The video remains private.`,
            link: "/CreatorDashboard",
            deliveryType: ["inbox"],
            notificationType: "MONETIZATION_REJECTED",
            timestamp: FieldValue.serverTimestamp() // SYNCED TO YOUR IMPORTS
        };
    }

    // 4. Execution: Write Notification and Increment Badge securely from Backend
    if (notification) {
        const batch = db.batch();
        const notifRef = db.collection("notifications").doc();
        const userRef = db.collection("creators").doc(creatorId);

        batch.set(notifRef, { ...notification, isRead: false, status: "pending" });
        batch.update(userRef, { unreadNotificationCount: FieldValue.increment(1) });
        
        await batch.commit();
        logger.info(`[Secure Monetization] Processed ${after.monetizationStatus} for ${creatorId}`);
    }
    return null;
});

// =====================================================================
// ================== ROAST ROOM TOKEN ECONOMY =========================
// =====================================================================

exports.purchaseRoastTokensWithEarnings = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to purchase tokens.");
    }

    const { costGYD, tokenAmount } = request.data || {};
    if (!costGYD || !tokenAmount) {
        throw new HttpsError("invalid-argument", "Missing package details.");
    }

    const db = admin.firestore();
    const userRef = db.collection("creators").doc(request.auth.uid);

    try {
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new HttpsError("not-found", "User profile not found.");

            const currentEarnings = userDoc.data().totalEarnings || 0;

            if (currentEarnings < costGYD) {
                throw new HttpsError("failed-precondition", "Insufficient earnings balance. Please use MMG.");
            }

            // Deduct earnings and add tokens using standalone FieldValue
            transaction.update(userRef, {
                totalEarnings: FieldValue.increment(-costGYD),
                roastTokens: FieldValue.increment(tokenAmount)
            });
        });

        logger.info(`User '${request.auth.uid}' purchased ${tokenAmount} tokens for ${costGYD} GYD from earnings.`);
        return { success: true, message: `Successfully purchased ${tokenAmount} Roast Passes!` };

    } catch (error) {
        logger.error("Token purchase error:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "Transaction failed.");
    }
});

const { AccessToken } = require('livekit-server-sdk');

exports.getRoastRoomToken = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const { roomName } = request.data;
    const participantName = request.auth.token.name || request.auth.uid;

    const db = admin.firestore();
    const userDoc = await db.collection("creators").doc(request.auth.uid).get();
    const role = userDoc.data()?.role || 'user';
    const isHost = role === 'admin' || role === 'authority';

    // YOUR SECURE SERVER KEYS
    const apiKey = "devkey_41a206e2";
    const apiSecret = "secret_37246b3bbc507fc41bdc94a8";

    const at = new AccessToken(apiKey, apiSecret, {
        identity: request.auth.uid,
        name: participantName,
    });

    at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: isHost,
        canSubscribe: true,
        canPublishData: true,
    });

    return { token: await at.toJwt() };
});

// =====================================================================
// ================== LIVE ROAST ARENA ORCHESTRATOR ====================
// =====================================================================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.clockIntoRoast = onCall({ enforceAppCheck: false, timeoutSeconds: 120 }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    
    const uid = request.auth.uid;
    const db = admin.firestore();
    const arenaRef = db.collection("live_arena").doc("main-arena");
    const userRef = db.collection("creators").doc(uid);

    // Look up the active host dynamically
    const hostQuery = await db.collection("creators").where("isLive", "==", true).where("liveRoomType", "==", "roast").limit(1).get();
    const activeHostId = hostQuery.empty ? null : hostQuery.docs[0].id;
    if (!activeHostId) throw new HttpsError('failed-precondition', 'No host is currently running the arena.');

    try {
        await db.runTransaction(async (transaction) => {
            const arenaSnap = await transaction.get(arenaRef);
            const userSnap = await transaction.get(userRef);
            
            if (arenaSnap.exists && arenaSnap.data()?.status !== 'idle') {
                throw new HttpsError('failed-precondition', 'Arena is currently occupied!');
            }
            if ((userSnap.data()?.roastTokens || 0) < 5) {
                throw new HttpsError('failed-precondition', 'Insufficient Roast Passes (Need 5).');
            }

            // 1. Deduct 5 tokens to enter
            transaction.update(userRef, { roastTokens: admin.firestore.FieldValue.increment(-5) });
            
            // 2. Initialize Battle State (Phase 1)
            transaction.set(arenaRef, {
                status: 'suspense', // Frontend Trigger
                hostId: activeHostId,
                roasterId: uid,
                roasterName: userSnap.data().creatorName || 'Anonymous',
                currentReceiver: 'none',
                timer: 5,
                fireCount: 0,
                tomatoCount: 0
            }, { merge: true });
        });

        // --- THE SEQUENTIAL STOPWATCH (Server-Side) ---
        
        // End of Phase 1 -> Start Phase 2: Roaster's Turn (30s)
        await delay(5000);
        await arenaRef.update({ status: 'battle', currentReceiver: 'roaster', timer: 30 }); // Frontend Trigger

        // End of Phase 2 -> Start Phase 3: Transition (5s)
        await delay(30000);
        await arenaRef.update({ status: 'suspense', currentReceiver: 'none', timer: 5 }); // Frontend Trigger

        // End of Phase 3 -> Start Phase 4: Host's Clapback (30s)
        await delay(5000);
        await arenaRef.update({ status: 'battle', currentReceiver: 'host', timer: 30 }); // Frontend Trigger

        // End of Phase 4 -> Phase 5: Result Calculation & Tax The Loser
        await delay(30000);
        
        const finalSnap = await arenaRef.get();
        const data = finalSnap.data();
        const netScore = (data.fireCount || 0) - (data.tomatoCount || 0);
        
        // "Zero Points" Concept: If Fire dominates, the Host loses influence. If Tomatoes (boos) dominate, the Host gains influence.
        const streakChange = netScore > 0 ? -1 : 1; 

        await arenaRef.update({
            status: 'idle',
            roasterId: null,
            currentReceiver: 'host',
            timer: 0,
            hostStreak: admin.firestore.FieldValue.increment(streakChange),
            fireCount: 0,
            tomatoCount: 0
        });

        return { success: true };
    } catch (error) {
        console.error("Battle failed:", error);
        await arenaRef.update({ status: 'idle', timer: 0 }).catch(() => {});
        throw error;
    }
});

// GIFT LOGIC: Routes money to the correct person based on the "Receiver" variable
exports.sendRoastReaction = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    
    const { reactionType } = request.data; // 'fire' or 'tomato'
    const db = admin.firestore();
    const arenaRef = db.collection("live_arena").doc("main-arena");
    const arenaSnap = await arenaRef.get();
    
    if (!arenaSnap.exists) throw new HttpsError('not-found', 'Arena not initialized.');
    const arenaData = arenaSnap.data();

    // Dynamically retrieve the active host
    let hostId = arenaData.hostId;
    if (!hostId) {
        const hostQuery = await db.collection("creators").where("isLive", "==", true).where("liveRoomType", "==", "roast").limit(1).get();
        if (!hostQuery.empty) hostId = hostQuery.docs[0].id;
    }
    if (!hostId) throw new HttpsError('failed-precondition', 'No host found in the arena.');

    const roasterId = arenaData.roasterId;
    const receiverRole = arenaData.currentReceiver; // 'host', 'roaster', or 'none'

    let finalRecipientId = hostId; // Default to host during idle/suspense phases
    if (receiverRole === 'roaster') finalRecipientId = roasterId;
    if (receiverRole === 'host') finalRecipientId = hostId;

    // TAX THE LOSER LOGIC:
    // If it's a Tomato (Boo), the money is ripped away and given to the OPPONENT.
    if (reactionType === 'tomato') {
        if (receiverRole === 'roaster') finalRecipientId = hostId;
        else if (receiverRole === 'host' && roasterId) finalRecipientId = roasterId; // If no roaster exists, host keeps it
        
        await arenaRef.update({ tomatoCount: FieldValue.increment(1) });
    } else {
        await arenaRef.update({ fireCount: FieldValue.increment(1) });
    }

    if (!finalRecipientId) return { success: false, message: "No active target" };

    // Transaction: Deduct 1 Pass from sender, deposit 20 GYD to recipient
    const senderRef = db.collection("creators").doc(request.auth.uid);
    const recipientRef = db.collection("creators").doc(finalRecipientId);

    await db.runTransaction(async (t) => {
        const sDoc = await t.get(senderRef);
        if ((sDoc.data().roastTokens || 0) < 1) {
            throw new HttpsError('failed-precondition', 'Out of tokens!');
        }
        
        t.update(senderRef, { roastTokens: FieldValue.increment(-1) });
        t.update(recipientRef, { totalEarnings: FieldValue.increment(20) }); // Fair platform split
    });

    return { success: true };
});

const functions = require("firebase-functions");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Initialize secure Cloudflare R2 S3-Compatible Client
const s3Client = new S3Client({
  endpoint: "https://fbe1faad8ca929a47c3cce338399f497.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: "516aad0243cfc6c02086f78bfd65f3a3",
    secretAccessKey: "bb32edef3c1757094a4ac551918f37f5047be235e62ce3f3d289d07d17ddd406",
  },
  region: "auto",
});

// Secure Cloud Function to generate upload URL
exports.getR2UploadUrl = functions.https.onCall(async (data, context) => {
  // Ensure only authenticated users can upload
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  }

  const { filePath, contentType } = data;
  if (!filePath) {
    throw new functions.https.HttpsError("invalid-argument", "Missing filePath.");
  }

  const bucketName = "nva-storage";
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: filePath,
    ContentType: contentType || "image/jpeg",
  });

  try {
    // Generate secure upload URL valid for 1 hour
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const publicUrl = `https://media.nvanetworkapp.com/${filePath}`;

    return { uploadUrl, publicUrl };
  } catch (error) {
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// =====================================================================
// ============ START: iOVERLORD R2 BACKEND CLEANUP HOOK ===============
// =====================================================================
exports.onContentDeleted = onDocumentDeleted("artifacts/{appId}/public/data/content_items/{contentId}", async (event) => {
    const deletedContent = event.data.data();
    if (!deletedContent) return null;

    const thumbnailUrl = deletedContent.customThumbnailUrl;

    // Skip if there's no thumbnail or if it's a legacy Firebase Storage link
    // (Legacy storage cleanup is handled separately until the Great Purge)
    if (!thumbnailUrl || !thumbnailUrl.includes('media.nvanetworkapp.com')) {
        return null;
    }

    try {
        // Strip the base URL and cache-buster query (?t=timestamp) to get the exact R2 Key
        // e.g., "https://media.nvanetworkapp.com/content_thumbnails/userX/thumb_123.jpg?t=456" 
        // becomes "content_thumbnails/userX/thumb_123.jpg"
        const urlObj = new URL(thumbnailUrl);
        const r2Key = urlObj.pathname.substring(1); 

        const command = new DeleteObjectCommand({
            Bucket: "nva-storage",
            Key: r2Key,
        });

        await s3Client.send(command);
        logger.info(`[R2 Cleanup] Vaporized orphaned thumbnail from Cloudflare R2: ${r2Key}`);
    } catch (error) {
        logger.error(`[R2 Cleanup ERROR] Failed to delete thumbnail from R2 for content ${event.params.contentId}:`, error);
    }

    return null;
});

// =====================================================================
// ============ START: REAL-TIME TYPING STATUS INDICATOR ===============
// =====================================================================
exports.updateTypingStatus = onCall(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const { chatId, isTyping } = request.data;
    if (!chatId) {
        throw new HttpsError("invalid-argument", "Missing chatId.");
    }

    const db = admin.firestore();
    try {
        // Safely set the typing state of the user in the parent chat document
        await db.collection("chats").doc(chatId).set({
            typing: {
                [uid]: isTyping || false
            }
        }, { merge: true });
        return { success: true };
    } catch (error) {
        logger.error(`Error in updateTypingStatus for user ${uid}:`, error);
        throw new HttpsError("internal", "Failed to update typing status.");
    }
});

// =====================================================================
// ============ UPGRADED: DYNAMIC EARNINGS-TO-GIFT & TICKET ENGINE =====
// =====================================================================
exports.sendGiftWithEarnings = onCall({ enforceAppCheck: false }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Unauthenticated.");

    // THE FIX: Destructure isAnonymous so standard gifts support anonymity logic
    const { targetUserId, giftName, amount, competitionId, entryId, eventId, recipientId, isAnonymous, isFilmmakerDonation } = request.data;
    if (!targetUserId || !giftName || !amount) {
        throw new HttpsError("invalid-argument", "Missing required transaction details.");
    }
    
    const db = admin.firestore();
    const senderRef = db.collection("creators").doc(uid);
    const recipientRef = db.collection("creators").doc(targetUserId);

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
    const netAmount = Math.round((amount * 0.85) * 100) / 100; // Deduct 15% platform fee

    try {
        await db.runTransaction(async (transaction) => {
            // 1. ALL TRANSACTION READS FIRST (Strictly Enforced)
            const [senderDoc, recipientDoc] = await Promise.all([
                transaction.get(senderRef),
                transaction.get(recipientRef)
            ]);

            if (!senderDoc.exists) throw new HttpsError("not-found", "Sender profile not found.");
            if (!recipientDoc.exists) throw new HttpsError("not-found", "Recipient profile not found.");

            const senderEarnings = senderDoc.data().totalEarnings || 0;
            if (senderEarnings < amount) {
                throw new HttpsError("failed-precondition", "Insufficient earnings balance.");
            }

            let eventDoc = null;
            let movieDoc = null;
            let ticketHolderDoc = null;
            let ticketHolderRef = null;

            if (eventId) {
                const finalRecipientId = recipientId || uid; // The ticket buyer or gifted friend
                ticketHolderRef = db.collection("creators").doc(finalRecipientId);

                const [evSnap, movSnap, holderSnap] = await Promise.all([
                    transaction.get(db.collection("events").doc(eventId)),
                    transaction.get(db.collection("movies").doc(eventId)),
                    transaction.get(ticketHolderRef)
                ]);
                eventDoc = evSnap;
                movieDoc = movSnap;
                ticketHolderDoc = holderSnap;

                if (!ticketHolderDoc.exists) throw new HttpsError("not-found", "Ticket recipient does not exist.");
            }

            // 2. TRANSACTION CALCULATIONS SECOND
            // (Values already rounded/sanitized)

            // 3. ALL TRANSACTION WRITES LAST
            // Deduct full ticket/gift value from Sender's Earnings
            transaction.update(senderRef, {
                totalEarnings: FieldValue.increment(-amount)
            });

            // --- PATHWAY A: EVENT TICKET TRANSACTION ---
            if (eventId && ticketHolderRef && !isFilmmakerDonation) {
                // Grant the Ticket instantly to the Recipient (Self or Friend)
                transaction.set(ticketHolderRef, { purchasedTickets: { [eventId]: true } }, { merge: true });

                // Update Event totals in main events collection
                if (eventDoc && eventDoc.exists) {
                    transaction.update(eventDoc.ref, {
                        ticketsSold: FieldValue.increment(1),
                        totalRevenue: FieldValue.increment(amount)
                    });
                }

                // Credit 85% to Filmmaker's Box Office Ledger in movies collection
                if (movieDoc && movieDoc.exists) {
                    const movieData = movieDoc.data();
                    if (movieData.creatorId) {
                        const filmmakerRef = db.collection("creators").doc(movieData.creatorId);
                        transaction.set(filmmakerRef, {
                            boxOfficeLedger: {
                                ticketSales: FieldValue.increment(netAmount)
                            }
                        }, { merge: true });
                    }
                }
            } 
            // --- PATHWAY B: STANDARD ACTOR TIP/GIFT TRANSACTION ---
            else {
                const giftFieldPath = `giftInventory.${giftName}`;
                const updates = {
                    giftsReceived: FieldValue.increment(1),
                    [giftFieldPath]: FieldValue.increment(1),
                    receivedGifts: FieldValue.arrayUnion({
                        id: `earnings_gift_${Date.now()}`,
                        giftName: giftName,
                        expiresAt: thirtyDaysFromNow.toISOString()
                    })
                };

                // DYNAMIC ROUTING: Box Office Ledger vs General Earnings
                if (isFilmmakerDonation) {
                    updates["boxOfficeLedger.filmDonations"] = FieldValue.increment(netAmount);
                } else {
                    updates.totalEarnings = FieldValue.increment(netAmount);
                }

                transaction.update(recipientRef, updates);

                // Update specific Competition Entry if applicable
                if (competitionId && entryId) {
                    const entryRef = db.doc(`competitions/${competitionId}/entries/${entryId}`);
                    transaction.update(entryRef, {
                        giftsReceived: FieldValue.increment(1),
                        [`giftInventory.${giftName}`]: FieldValue.increment(1)
                    });
                }
            }

            // 4. Record Supporter Entry & Toast Broadcast
            const senderData = senderDoc.data();
            const supporterRef = recipientRef.collection("supporters").doc(uid);
            transaction.set(supporterRef, {
                userName: senderData.creatorName || senderData.email,
                amountGiven: FieldValue.increment(amount),
                lastGift: new Date().toISOString()
            }, { merge: true });

            const broadcastNotification = {
                broadcastType: "GIFT_RECEIVED",
                message: eventId 
                    ? `🎟️ ${senderData.creatorName || senderData.email} purchased a Premiere Ticket!`
                    : `🎉 ${senderData.creatorName || senderData.email} sent a [${giftName}] to ${recipientDoc.data().creatorName}!`,
                link: eventId ? `/discover` : `/user/${targetUserId}`,
                timestamp: new Date()
            };
            transaction.set(db.collection("broadcast_notifications").doc(), broadcastNotification);

            // THE FIX: Move notification delivery inside the transaction scope for BOTH Tickets and Gifts
            const notificationsRef = db.collection("notifications");

            if (eventId && !isFilmmakerDonation) {
                const finalRecipientId = recipientId || uid;
                const isGift = !!recipientId;
                
                const senderName = senderData.creatorName || senderData.email || "A friend";
                const recipientName = isGift ? (recipientDoc.data().creatorName || "your friend") : "yourself";
                const filmName = eventDoc?.data()?.eventTitle || "the Premiere";

                if (isGift) {
                    transaction.set(notificationsRef.doc(), {
                        userId: finalRecipientId,
                        title: "Gift Ticket Received! 🎟️",
                        body: `${senderName} gifted you a ticket for ${filmName}`,
                        link: "/Discover",
                        deliveryType: ["inbox", "push"],
                        notificationType: "TICKET_GIFTED",
                        isRead: false,
                        status: "pending",
                        sound: true,
                        timestamp: FieldValue.serverTimestamp()
                    });
                    transaction.update(db.collection("creators").doc(finalRecipientId), { unreadNotificationCount: FieldValue.increment(1) });

                    transaction.set(notificationsRef.doc(), {
                        userId: uid,
                        title: "Ticket Delivered",
                        body: `Your gift ticket to ${recipientName} for ${filmName} has been delivered successfully.`,
                        link: "/Discover",
                        deliveryType: ["inbox"],
                        notificationType: "TICKET_DELIVERED",
                        isRead: false,
                        status: "pending",
                        sound: false,
                        timestamp: FieldValue.serverTimestamp()
                    });
                    transaction.update(db.collection("creators").doc(uid), { unreadNotificationCount: FieldValue.increment(1) });
                } else {
                    transaction.set(notificationsRef.doc(), {
                        userId: uid,
                        title: "Ticket Purchase Confirmed! 🎟️",
                        body: `Your ticket for ${filmName} is confirmed!`,
                        link: "/Discover",
                        deliveryType: ["inbox", "push"],
                        notificationType: "TICKET_PURCHASED",
                        isRead: false,
                        status: "pending",
                        sound: true,
                        timestamp: FieldValue.serverTimestamp()
                    });
                    transaction.update(db.collection("creators").doc(uid), { unreadNotificationCount: FieldValue.increment(1) });
                }
            } else {
                // --- THE AUDIT FIX: Dispatch Dynamic Gifting/Donation notifications based on Competition context ---
                const senderName = senderData.creatorName || senderData.email || "A fan";
                const isShowcaseDonation = !competitionId; // Showcase donations have no competition context

                const notifTitle = isShowcaseDonation ? "New Film Donation! 🎁" : "You Received a Gift! 🎁";
                const notifBody = isShowcaseDonation 
                    ? (isAnonymous ? `An anonymous fan sent you a donation of ${amount.toLocaleString()} GYD for your Showcase film!` : `${senderName} sent you a donation of ${amount.toLocaleString()} GYD for your Showcase film!`)
                    : (isAnonymous ? `An anonymous fan sent you a ${giftName}!` : `${senderName} sent you a ${giftName}!`);
                
                // 1. Notify Receiver
                transaction.set(notificationsRef.doc(), {
                    userId: targetUserId,
                    title: notifTitle,
                    body: notifBody,
                    link: "/CreatorDashboard",
                    deliveryType: ["inbox", "push"],
                    notificationType: "GIFT_RECEIVED",
                    isRead: false,
                    status: "pending",
                    sound: true,
                    timestamp: FieldValue.serverTimestamp()
                });
                transaction.update(recipientRef, { unreadNotificationCount: FieldValue.increment(1) });

                // 2. Notify Sender
                transaction.set(notificationsRef.doc(), {
                    userId: uid,
                    title: "Gift Delivered",
                    body: `Your ${giftName} to ${recipientDoc.data().creatorName || 'the creator'} has been delivered successfully.`,
                    link: "/Home",
                    deliveryType: ["inbox"],
                    notificationType: "Pledge Approved",
                    isRead: false,
                    status: "pending",
                    sound: false,
                    timestamp: FieldValue.serverTimestamp()
                });
                transaction.update(senderRef, { unreadNotificationCount: FieldValue.increment(1) });
            }
        });

        logger.info(`User '${uid}' successfully completed earnings-deducted transaction.`);
        return { success: true, message: "Transaction completed successfully." };

    } catch (error) {
        logger.error("Transaction failed:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", error.message);
    }
});

// =====================================================================
// ============ 4. DELETE PAYOUT RECORD (USER CLEANUP - SOFT DELETE) ===
// =====================================================================
exports.deletePayoutRecord = onCall({ enforceAppCheck: false }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Unauthenticated.");

    const { recordId } = request.data;
    if (!recordId) throw new HttpsError("invalid-argument", "Missing record ID.");

    const db = admin.firestore();
    const recordRef = db.collection("payoutHistory").doc(recordId);

    try {
        const docSnap = await recordRef.get();
        if (!docSnap.exists) throw new HttpsError("not-found", "Record not found.");
        if (docSnap.data().userId !== uid) throw new HttpsError("permission-denied", "Unauthorized.");

        // Secure Fix: Soft-delete only so treasury audit trails are never lost [1]
        await recordRef.update({ hiddenByCreator: true });
        return { success: true, message: "Record removed from history." };
    } catch (error) {
        throw new HttpsError("internal", error.message);
    }
});

// =====================================================================
// ============ 5. SYSTEM FINANCIAL REPORTING ENGINE ==================
// =====================================================================
exports.getSystemFinancialReport = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth?.token?.admin) throw new HttpsError("permission-denied", "Admin only.");

    const { startDate, endDate } = request.data;
    const db = admin.firestore();
    
    // Friendly mapping for your itemized sections
    const SECTION_MAP = {
        'giftToken': 'Gifts & Donations',
        'competitionEntry': 'Casting Tournaments',
        'roastTokens': 'Roast Room Passes',
        'eventTicket': 'Box Office Tickets'
    };

    try {
        const q = db.collection("paymentPledges")
            .where("status", "==", "approved")
            .where("createdAt", ">=", startDate)
            .where("createdAt", "<=", endDate);

        const snapshot = await q.get();
        const report = {
            grandTotalGross: 0,
            grandTotalRevenue: 0, // 15%
            grandTotalLiabilities: 0, // 85%
            sections: {},
            dailyBreakdown: {}
        };

        snapshot.forEach(doc => {
            const data = doc.data();
            const gross = data.amount || 0;
            const revenue = Math.round((gross * PLATFORM_FEE_PERCENTAGE) * 100) / 100;
            const liability = gross - revenue;
            const type = data.paymentType || 'other';
            const sectionName = SECTION_MAP[type] || 'Miscellaneous';
            
            // Extract date string (YYYY-MM-DD) for daily tracking
            const dateKey = data.createdAt.split('T')[0];

            // 1. Aggregate Section Totals
            if (!report.sections[sectionName]) {
                report.sections[sectionName] = { gross: 0, revenue: 0, liability: 0, count: 0 };
            }
            report.sections[sectionName].gross += gross;
            report.sections[sectionName].revenue += revenue;
            report.sections[sectionName].liability += liability;
            report.sections[sectionName].count += 1;

            // 2. Aggregate Daily Totals
            if (!report.dailyBreakdown[dateKey]) {
                report.dailyBreakdown[dateKey] = { gross: 0, count: 0 };
            }
            report.dailyBreakdown[dateKey].gross += gross;
            report.dailyBreakdown[dateKey].count += 1;

            // 3. Grand Totals
            report.grandTotalGross += gross;
            report.grandTotalRevenue += revenue;
            report.grandTotalLiabilities += liability;
        });

        return report;
    } catch (error) {
        throw new HttpsError("internal", error.message);
    }
});

// =====================================================================
// ============ 6. MASTER SYSTEM FINANCIAL PURGE (FRESH START) =========
// =====================================================================
exports.purgeSystemFinancials = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth?.token?.admin) throw new HttpsError("permission-denied", "Admin only.");

    const db = admin.firestore();
    const batchSize = 500;

    try {
        // Expanded to include transactions and expenses for a 100% airtight clean slate [1]
        const collectionsToWipe = ["paymentPledges", "payoutHistory", "payoutRequests", "transactions", "expenses"];
        
        for (const coll of collectionsToWipe) {
            const query = db.collection(coll).limit(batchSize);
            let snapshot = await query.get();
            while (snapshot.size > 0) {
                const batch = db.batch();
                snapshot.docs.forEach((doc) => batch.delete(doc.ref));
                await batch.commit();
                snapshot = await query.get();
            }
        }

        // Reset all creator earnings, stats, and virtual token balances to 0
        const creators = await db.collection("creators").get();
        const statsBatch = db.batch();
        creators.forEach(doc => {
            statsBatch.update(doc.ref, {
                totalEarnings: 0,
                giftsReceived: 0,
                lifetimeSpent: 0,
                roastTokens: 0,        // Wipes test tokens
                tokenCashValue: 0,    // Wipes test token value
                giftInventory: {},    // Clears emoji counts
                receivedGifts: [],    // Clears gift history
                purchasedTickets: {}  // Clears test event access
            });
        });
        await statsBatch.commit();

        return { success: true, message: "Financial system purged and balances reset to zero." };
    } catch (error) {
        throw new HttpsError("internal", error.message);
    }
});

// =====================================================================
// ADMIN PROCESS BOX OFFICE SWEEP (Ledger -> Earnings - FULL AUDITED VERSION)
// =====================================================================
exports.approveBoxOfficeSweep = onCall(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    // THE FIX: Authorize both Admins and Super Admins dynamically
    const isAdminUser = request.auth.token?.admin === true || request.auth.token?.super_admin === true;
    if (!isAdminUser) {
        throw new HttpsError("permission-denied", "Only administrators can initiate a box office sweep.");
    }

    const { requestId } = request.data;
    if (!requestId) {
        throw new HttpsError("invalid-argument", "Missing requestId.");
    }

    const db = admin.firestore();

    try {
        await db.runTransaction(async (transaction) => {
            const reqRef = db.collection("payoutRequests").doc(requestId);
            const reqDoc = await transaction.get(reqRef);
            
            if (!reqDoc.exists) {
                throw new HttpsError("not-found", "Payout request not found.");
            }
            
            const data = reqDoc.data();
            if (data.status !== 'pending' || data.type !== 'boxOfficeSweep') {
                throw new HttpsError("failed-precondition", "Invalid request status or type for a box office sweep.");
            }

            const creatorRef = db.collection("creators").doc(data.userId);
            const creatorDoc = await transaction.get(creatorRef);
            
            if (!creatorDoc.exists) {
                throw new HttpsError("not-found", "Creator profile not found.");
            }

            const creatorData = creatorDoc.data();
            const sweepAmount = data.amount;

            // Secure, fail-safe deductions: Pull from ticketSales first, then flow through filmDonations if needed
            const currentSales = creatorData.boxOfficeLedger?.ticketSales || 0;
            const currentDonations = creatorData.boxOfficeLedger?.filmDonations || 0;
            const availableLedger = currentSales + currentDonations;

            if (sweepAmount > availableLedger) {
                throw new HttpsError("failed-precondition", "Requested sweep amount exceeds available Box Office balance.");
            }

            const newSales = Math.max(0, currentSales - sweepAmount);
            const remainingSweep = Math.max(0, sweepAmount - currentSales);
            const newDonations = Math.max(0, currentDonations - remainingSweep);

            // 1. Transaction Updates: Safely Deduct ledger totals & increment main earnings atomically
            transaction.update(creatorRef, {
                totalEarnings: FieldValue.increment(sweepAmount),
                "boxOfficeLedger.ticketSales": newSales,
                "boxOfficeLedger.filmDonations": newDonations
            });

            // 2. Mark request as processed
            transaction.update(reqRef, { 
                status: "processed", 
                processedAt: FieldValue.serverTimestamp(), 
                processedBy: uid 
            });
            
            // 3. Log in Payout Audit History Archive
            const historyRef = db.collection("payoutHistory").doc();
            const systemReceiptId = `SWEEP-${Date.now()}`;
            transaction.set(historyRef, {
                userId: data.userId,
                creatorName: data.creatorName,
                amount: sweepAmount,
                systemReceiptId,
                adminTxId: "INTERNAL_LEDGER_TRANSFER",
                processedAt: FieldValue.serverTimestamp(),
                type: 'boxOfficeSweep',
                notes: data.campaignTitle || "Box Office Funds Transfer"
            });

            // 4. THE FIX: Write transaction log for Finance Command P&L Hub Reports
            const txnRef = db.collection("transactions").doc();
            transaction.set(txnRef, {
                amount: sweepAmount,
                source: 'box_office',
                type: 'payout_sweep',
                userId: data.userId,
                creatorName: data.creatorName,
                createdAt: FieldValue.serverTimestamp()
            });

            // 5. THE FIX: Create highly detailed, relational user notification with associated film title
            const notifRef = db.collection("notifications").doc();
            transaction.set(notifRef, {
                userId: data.userId,
                title: "Box Office Sweep Approved! 🎟️",
                body: `${sweepAmount.toLocaleString()} GYD was added to your earnings (Approved by Admin) from '${data.campaignTitle || 'your film'}' box office ticket sales.`,
                link: "/CreatorDashboard",
                deliveryType: ["inbox", "push"],
                notificationType: "PAYOUT_PAID",
                isRead: false,
                status: "pending",
                sound: true,
                timestamp: FieldValue.serverTimestamp()
            });

            // Increment notifications badge count
            transaction.update(creatorRef, {
                unreadNotificationCount: FieldValue.increment(1)
            });
        });

        logger.info(`Admin '${uid}' successfully approved box office sweep request '${requestId}'.`);
        return { success: true, message: "Box office sweep approved and funds transferred." };

    } catch (error) {
        logger.error(`Error approving box office sweep request '${requestId}':`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", error.message || "An unexpected error occurred.");
    }
});

exports.nukeCenterStageStorage = onCall(async (request) => {
    // Restrict execution strictly to verified administrators
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.super_admin)) {
        throw new HttpsError('failed-precondition', 'Must be an administrator to trigger this function.');
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    try {
        // === 1. PURGE STORAGE FILES ===
        // Purge all custom contestant uploads
        await bucket.deleteFiles({ prefix: 'centerstage_thumbs/' }).catch(() => {});
        // Purge all dynamic sponsor banners
        await bucket.deleteFiles({ prefix: 'centerstage_sponsor/' }).catch(() => {});

        // === 2. PURGE DATABASE LEADERBOARD COLLECTION ===
        const leaderboardRef = db.collection("leaderboard");
        const leaderboardSnap = await leaderboardRef.get();
        if (!leaderboardSnap.empty) {
            const batch = db.batch();
            leaderboardSnap.forEach(docSnap => {
                batch.delete(docSnap.ref);
            });
            await batch.commit();
        }

        // === 3. GLOBAL LEADERBOARD RESET FOR ALL CREATORS ===
        // Instead of only clearing active contestants, we clear giftsReceived and giftInventory 
        // across ALL creators so the board is cleanly wiped, while leaving "badges" completely untouched [1]
        const creatorsRef = db.collection("creators");
        const creatorsSnap = await creatorsRef.get();
        
        if (!creatorsSnap.empty) {
            const batch = db.batch();
            creatorsSnap.forEach(docSnap => {
                const data = docSnap.data();
                // Check if they accumulated any votes or gifts this season [1]
                if (data.giftsReceived > 0 || data.voteCount > 0 || Object.keys(data.giftInventory || {}).length > 0) {
                    batch.update(docSnap.ref, {
                        giftsReceived: 0,
                        voteCount: 0,
                        giftInventory: {},
                        currentChallengeLink: "",
                        currentChallengeThumbnail: "",
                        performances: {},
                        isEliminated: false,
                        eliminatedAtStageIndex: null,
                        teamTag: ""
                        // Notice: "badges" is completely excluded, preserving their legacy status [1]
                    });
                }
            });
            await batch.commit();
        }

        return { 
            success: true, 
            message: "Season storage folders, leaderboard collections, and creator statistics have been cleanly wiped." 
        };
    } catch (err) {
        throw new HttpsError('internal', err.message);
    }
});

// ==========================================
// MANUAL COMPETITION REVELATION BYPASS
// ==========================================
exports.revealCompetitionResults = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) { throw new HttpsError("unauthenticated", "You must be logged in to perform this action."); }

    if (request.auth.token.admin !== true && request.auth.token.super_admin !== true) {
        throw new HttpsError("permission-denied", "You must be an admin to reveal results.");
    }

    const { competitionId } = request.data;
    if (!competitionId) {
        throw new HttpsError("invalid-argument", "The function must be called with 'competitionId'.");
    }

    const db = admin.firestore();
    logger.info(`Admin '${uid}' is manually revealing results for competition '${competitionId}'.`);

    const competitionRef = db.collection("competitions").doc(competitionId);
    const competitionDoc = await competitionRef.get();

    if (!competitionDoc.exists) {
        throw new HttpsError("not-found", "Competition not found.");
    }

    const competitionData = competitionDoc.data();
    
    const batch = db.batch();
    batch.update(competitionRef, { status: "Results Visible" });

    const broadcast = {
        broadcastType: "COMPETITION_RESULTS",
        message: `The results for the competition "${competitionData.title}" are in! See who won.`,
        link: "/CompetitionScreen",
        timestamp: new Date()
    };
    batch.set(db.collection("broadcast_notifications").doc(), broadcast);

    const winnersToNotify = competitionData.winnersToNotify;
    if (winnersToNotify > 0) {
        try {
            const entriesRef = competitionRef.collection("entries");
            const entriesQuery = entriesRef.orderBy("likeCount", "desc").limit(winnersToNotify);
            const winnersSnapshot = await entriesQuery.get();

            if (!winnersSnapshot.empty) {
                let rank = 1;
                winnersSnapshot.forEach(winnerDoc => {
                    const winnerData = winnerDoc.data();
                    const winnerId = winnerData.userId;
                    if (!winnerId) return;

                    let rankString = (rank === 1) ? "1st" : (rank === 2) ? "2nd" : (rank === 3) ? "3rd" : `${rank}th`;
                    
                    const notificationPayload = {
                        userId: winnerId,
                        title: "You Won!",
                        body: `Congratulations! You won ${rankString} place in the "${competitionData.title}" competition!`,
                        link: "/CompetitionScreen",
                        deliveryType: ["inbox", "push"],
                        notificationType: "COMPETITION_WINNER",
                        sound: true,
                        isRead: false,
                        status: "pending",
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    };
                    
                    batch.set(db.collection("notifications").doc(), notificationPayload);
                    const winnerRef = db.collection("creators").doc(winnerId);
                    batch.update(winnerRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
                    
                    rank++;
                });
            }
        } catch (queryError) {
            logger.error(`CRITICAL FAILURE: Could not query winners for competition '${competitionId}':`, queryError);
            throw new HttpsError("internal", "Failed to query and notify tournament winners.");
        }
    }

    await batch.commit();
    return { success: true, message: "Results revealed and winners notified successfully!" };
});

// =====================================================================
// ADMIN MANUAL OVERRIDE SWEEP (Sweeps a user's ledger directly from admin profile card)
// =====================================================================
exports.transferBoxOfficeToUser = onCall(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }

    // Authorize Super Admins, Admins, and Authorities dynamically
    const callerRef = admin.firestore().collection("creators").doc(uid);
    const callerSnap = await callerRef.get();
    if (!callerSnap.exists || (callerSnap.data().role !== 'admin' && callerSnap.data().role !== 'authority' && callerSnap.data().role !== 'super_admin')) {
        throw new HttpsError("permission-denied", "Only administrators can initiate a manual box office sweep.");
    }

    const { targetUserId } = request.data;
    if (!targetUserId) {
        throw new HttpsError("invalid-argument", "Missing targetUserId parameter.");
    }

    const db = admin.firestore();

    try {
        await db.runTransaction(async (transaction) => {
            const creatorRef = db.collection("creators").doc(targetUserId);
            const creatorDoc = await transaction.get(creatorRef);
            
            if (!creatorDoc.exists) {
                throw new HttpsError("not-found", "Target creator profile not found.");
            }

            const creatorData = creatorDoc.data();
            const currentSales = creatorData.boxOfficeLedger?.ticketSales || 0;
            const currentDonations = creatorData.boxOfficeLedger?.filmDonations || 0;
            const totalSweep = currentSales + currentDonations;

            if (totalSweep <= 0) {
                throw new HttpsError("failed-precondition", "Target user has no box office funds to sweep.");
            }

            // 1. Transaction Updates: Safely Deduct ledger totals & increment main earnings atomically
            transaction.update(creatorRef, {
                totalEarnings: FieldValue.increment(totalSweep),
                "boxOfficeLedger.ticketSales": 0,
                "boxOfficeLedger.filmDonations": 0
            });

            // 2. Log in Payout Audit History Archive
            const historyRef = db.collection("payoutHistory").doc();
            const systemReceiptId = `SWEEP-MANUAL-${Date.now()}`;
            transaction.set(historyRef, {
                userId: targetUserId,
                creatorName: creatorData.creatorName || "NVA Creator",
                amount: totalSweep,
                systemReceiptId,
                adminTxId: "MANUAL_OVERRIDE_SWEEP",
                processedAt: FieldValue.serverTimestamp(),
                type: 'boxOfficeSweep',
                notes: "Manual Admin Override Sweep"
            });

            // 3. Write transaction log for Finance Command P&L Hub Reports
            const txnRef = db.collection("transactions").doc();
            transaction.set(txnRef, {
                amount: totalSweep,
                source: 'box_office',
                type: 'payout_sweep',
                userId: targetUserId,
                creatorName: creatorData.creatorName || "NVA Creator",
                createdAt: FieldValue.serverTimestamp()
            });

            // 4. Create highly detailed user notification
            const notifRef = db.collection("notifications").doc();
            transaction.set(notifRef, {
                userId: targetUserId,
                title: "Box Office Manual Sweep Approved! 🎟️",
                body: `${totalSweep.toLocaleString()} GYD was moved to your earnings via a manual admin sweep of your Box Office.`,
                link: "/CreatorDashboard",
                deliveryType: ["inbox", "push"],
                notificationType: "PAYOUT_PAID",
                isRead: false,
                status: "pending",
                sound: true,
                timestamp: FieldValue.serverTimestamp()
            });

            // Increment notifications badge count
            transaction.update(creatorRef, {
                unreadNotificationCount: FieldValue.increment(1)
            });
        });

        logger.info(`Admin '${uid}' successfully completed manual box office sweep for user '${targetUserId}'.`);
        return { success: true, message: "Manual box office sweep completed successfully." };

    } catch (error) {
        logger.error(`Error completing manual box office sweep for user '${targetUserId}':`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", error.message || "An unexpected error occurred.");
    }
});

// =====================================================================
// LIFT BOX OFFICE COOLDOWN (Admin Master Reset for Ledger Locks)
// =====================================================================
exports.liftBoxOfficeCooldown = onCall(async (request) => {
    if (!request.auth || (request.auth.token.admin !== true && request.auth.token.super_admin !== true)) {
        throw new HttpsError("permission-denied", "Unauthorized.");
    }
    const { targetUserId } = request.data;
    const db = admin.firestore();

    try {
        const batch = db.batch();

        // 1. Clear persistent profile lock
        const userRef = db.collection("creators").doc(targetUserId);
        batch.update(userRef, { payoutLockUntil: admin.firestore.FieldValue.delete() });

        // 2. Takedown all active Premiere films for this user to release the live lock
        const arenaRef = db.collection("movies");
        const activePremieres = await arenaRef.where("creatorId", "==", targetUserId).where("type", "==", "premiere").get();
        
        activePremieres.forEach(doc => {
            batch.delete(doc.ref);
        });

        // 3. Delete from public events library to prevent ghost links
        const eventsRef = db.collection("events");
        const activeEvents = await eventsRef.where("creatorId", "==", targetUserId).get();
        activeEvents.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        return { success: true, message: "Box Office fully unlocked. All premiere locks cleared." };
    } catch (error) {
        throw new HttpsError("internal", error.message);
    }
});

// =====================================================================
// ============ PHASE B: RECURSIVE DELETION TRIGGERS ===================
// =====================================================================

// Reusable helper to safely extract Firebase Storage paths from URLs
const getPathFromUrl = (url) => {
    if (!url || !url.startsWith('https://firebasestorage.googleapis.com')) return null;
    try {
        const decodedUrl = decodeURIComponent(url);
        return decodedUrl.split('/o/')[1].split('?')[0];
    } catch (e) {
        logger.warn(`Could not parse URL for deletion: ${url}`, e);
        return null;
    }
};

exports.onEventDeleted = onDocumentDeleted("events/{eventId}", async (event) => {
    const deletedEvent = event.data.data();
    if (!deletedEvent) return null;

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const eventId = event.params.eventId;
    
    logger.info(`[Audit] Running recursive cleanup for deleted event: ${eventId}`);

    try {
        // 1. Purge Cloud Storage Files (Thumbnails/Posters)
        const posterPath = getPathFromUrl(deletedEvent.thumbnailUrl || deletedEvent.posterUrl);
        if (posterPath) {
            await bucket.file(posterPath).delete().catch(e => logger.warn(`Non-fatal: Failed to delete event poster: ${posterPath}`, e));
        }

        // 2. Erase all orphaned subcollections
        const subcollections = ["likes", "comments", "mutedUsers", "chatMessages"];
        for (const sub of subcollections) {
            const snap = await db.collection(`events/${eventId}/${sub}`).get();
            if (!snap.empty) {
                const batch = db.batch();
                snap.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                logger.info(`Cleared ${snap.size} documents from events/${eventId}/${sub}`);
            }
        }
    } catch (error) {
        logger.error(`[Cleanup Error] Failed to clean up event ${eventId}:`, error);
    }
    return null;
});

exports.onMovieDeleted = onDocumentDeleted("movies/{movieId}", async (event) => {
    const deletedMovie = event.data.data();
    if (!deletedMovie) return null;

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const movieId = event.params.movieId;
    
    logger.info(`[Audit] Running recursive cleanup for deleted movie: ${movieId}`);

    try {
        // 1. Purge Cloud Storage Files (Posters, Trailers, Custom Uploads)
        const assetUrls = [deletedMovie.posterUrl, deletedMovie.trailerUrl, deletedMovie.videoUrl];
        for (const url of assetUrls) {
            const path = getPathFromUrl(url);
            if (path) {
                await bucket.file(path).delete().catch(e => logger.warn(`Non-fatal: Failed to delete movie asset: ${path}`, e));
            }
        }

        // 2. Erase Root-Level Relational Data (Movie Reviews)
        const reviewsSnap = await db.collection("movieReviews").where("movieId", "==", movieId).get();
        if (!reviewsSnap.empty) {
            const batch = db.batch();
            reviewsSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            logger.info(`Cleared ${reviewsSnap.size} orphaned reviews for movie ${movieId}`);
        }
    } catch (error) {
        logger.error(`[Cleanup Error] Failed to clean up movie ${movieId}:`, error);
    }
    return null;
});

// =====================================================================
// ============ SECURE PAYOUT REQUEST SUBMISSION =======================
// =====================================================================
exports.requestPayout = onCall(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be logged in.");

    const { fullName, mmgNumber } = request.data;
    if (!fullName || !mmgNumber) throw new HttpsError("invalid-argument", "Missing MMG details.");

    const db = admin.firestore();
    const creatorRef = db.collection("creators").doc(uid);

    try {
        await db.runTransaction(async (transaction) => {
            const creatorDoc = await transaction.get(creatorRef);
            if (!creatorDoc.exists) throw new HttpsError("not-found", "Creator profile not found.");

            const data = creatorDoc.data();
            const currentEarnings = data.totalEarnings || 0;

            // 1. SERVER-SIDE VALIDATION: Minimum Balance (10,000 GYD)
            if (currentEarnings < 10000) {
                throw new HttpsError("failed-precondition", "Insufficient earnings. Minimum 10,000 GYD required.");
            }

            // 2. SERVER-SIDE VALIDATION: Cooldown (30 Days)
            if (data.lastPayoutDate) {
                const lastPayout = data.lastPayoutDate.toDate ? data.lastPayoutDate.toDate() : new Date(data.lastPayoutDate);
                const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
                if (Date.now() - lastPayout.getTime() < thirtyDaysInMs) {
                    throw new HttpsError("failed-precondition", "You must wait 30 days between payout requests.");
                }
            }

            // 3. SERVER-SIDE VALIDATION: Prevent Duplicate Requests
            if (data.payoutStatus === 'pending' || data.payoutStatus === 'approved') {
                throw new HttpsError("failed-precondition", "You already have an active payout request in the queue.");
            }

            // 4. Write the secure request
            const requestRef = db.collection("payoutRequests").doc();
            transaction.set(requestRef, {
                type: 'cashOut',
                userId: uid,
                creatorName: data.creatorName || "NVA Creator",
                email: request.auth.token.email || "Unknown",
                amount: currentEarnings,
                fullName: fullName,
                mmgNumber: mmgNumber,
                status: 'pending',
                requestedAt: FieldValue.serverTimestamp()
            });

            // 5. Lock the dashboard status securely
            transaction.update(creatorRef, {
                payoutStatus: 'pending'
            });
        });

        logger.info(`User '${uid}' successfully submitted a secure payout request.`);
        return { success: true, message: "Payout request submitted securely." };

    } catch (error) {
        logger.error(`Error processing payout request for ${uid}:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred during submission.");
    }
});
// --- END: Robust, Multi-Screen Social Share Renderer (SSR) v3 ---