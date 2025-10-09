// FORCED UPDATE: 2025-10-04 23:59
// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentUpdated, onDocumentDeleted, onDocumentCreated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");

// The Firebase Admin SDK to access Firestore.
const admin = require("firebase-admin");
admin.initializeApp(); // THIS IS THE CORRECT, DEFAULT INITIALIZATION

const PLATFORM_FEE_PERCENTAGE = 0.07; // 7% platform fee

// =========== START: GHOST CLEANUP FUNCTION ===========
exports.cleanupGhostArtifacts = onCall(async (request) => {
    // Security Check: Only an admin can run this destructive operation.
    if (request.auth.token.admin !== true) {
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


exports.approvePledge = onCall(async (request) => {
  const uid = request.auth.uid;
  if (!uid) { throw new HttpsError("unauthenticated", "You must be logged in to perform this action."); }

  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "You must be an admin to approve pledges.");
  }
  
  const { pledgeId, appId } = request.data;
  if (!pledgeId || !appId) {
    throw new HttpsError("invalid-argument", "The function must be called with 'pledgeId' and 'appId'.");
  }

  logger.info(`Admin '${uid}' initiated approval for pledge '${pledgeId}' in app '${appId}'.`);
  const db = admin.firestore();
  
  try {
    await db.runTransaction(async (transaction) => {
      const pledgeRef = db.collection("paymentPledges").doc(pledgeId);
      const pledgeDoc = await transaction.get(pledgeRef);

      if (!pledgeDoc.exists) { throw new HttpsError("not-found", `Pledge with ID '${pledgeId}' does not exist.`); }
      if (pledgeDoc.data().status !== "pending") { throw new HttpsError("failed-precondition", `Pledge is not in 'pending' state.`); }

      const pledgeData = pledgeDoc.data();
      const userRef = db.collection("creators").doc(pledgeData.userId);
      const approvalTimestamp = new Date();
      const notificationsRef = db.collection("notifications");
      
      if (pledgeData.paymentType === 'donation') {
        const campaignRef = db.collection(`artifacts/${appId}/public/data/campaigns`).doc(pledgeData.targetCampaignId);
        const campaignDoc = await transaction.get(campaignRef);
        const grossAmount = pledgeData.amount;
        const netAmount = Math.round((grossAmount * (1 - PLATFORM_FEE_PERCENTAGE)) * 100) / 100;
        
        transaction.update(pledgeRef, { status: "approved", approvedAt: approvalTimestamp.toISOString(), approvedBy: uid });
        transaction.update(userRef, { totalApproved: admin.firestore.FieldValue.increment(1), updatedAt: approvalTimestamp.toISOString() });
        transaction.update(campaignRef, { raised: admin.firestore.FieldValue.increment(netAmount) });
        
        if (campaignDoc.exists) {
            const campaignData = campaignDoc.data();
            const newRaisedAmount = (campaignData.raised || 0) + netAmount;
            // Check if the goal has just been met or exceeded
            if (campaignData.raised < campaignData.goal && newRaisedAmount >= campaignData.goal) {
                const goalReachedNotification = {
                    userId: campaignData.creatorId,
                    type: 'CAMPAIGN_GOAL_REACHED',
                    message: `Congratulations! Your campaign "${campaignData.title}" has reached its funding goal!`,
                    link: `/CreatorDashboard`,
                    isRead: false,
                    timestamp: approvalTimestamp
                };
                transaction.set(notificationsRef.doc(), goalReachedNotification);
                // Badge Logic
                const campaignCreatorRef = db.collection("creators").doc(campaignData.creatorId);
                transaction.update(campaignCreatorRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
            }
        
            const campaignCreatorId = campaignData.creatorId;
            const creatorNotification = {
                userId: campaignCreatorId, type: 'DONATION_RECEIVED',
                message: `${pledgeData.userName} donated $${pledgeData.amount.toFixed(2)} to your campaign "${pledgeData.targetCampaignTitle}"!`,
                link: `/CreatorDashboard`, isRead: false, timestamp: approvalTimestamp
            };
            transaction.set(notificationsRef.doc(), creatorNotification);
            // Badge Logic
            const creatorRefForDonation = db.collection("creators").doc(campaignCreatorId);
            transaction.update(creatorRefForDonation, { unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
        }
        
        const donorNotification = {
            userId: pledgeData.userId, type: 'DONATION_CONFIRMED',
            message: `Your donation of $${pledgeData.amount.toFixed(2)} to "${pledgeData.targetCampaignTitle}" was approved. Thank you!`,
            link: `/Home`, isRead: false, timestamp: approvalTimestamp
        };
        transaction.set(notificationsRef.doc(), donorNotification);
        // Badge Logic
        transaction.update(userRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(1) });

        const broadcastNotification = {
            broadcastType: "DONATION", 
            userName: pledgeData.userName,
            amount: pledgeData.amount,
            targetCampaignTitle: pledgeData.targetCampaignTitle,
            message: `${pledgeData.userName} just supported the "${pledgeData.targetCampaignTitle}" campaign!`,
            link: "/AllCampaigns", 
            timestamp: approvalTimestamp
        };
        transaction.set(db.collection("broadcast_notifications").doc(), broadcastNotification);

      } else if (pledgeData.paymentType === 'premium') {
        const premiumExpiresAt = new Date(approvalTimestamp);
        premiumExpiresAt.setMonth(premiumExpiresAt.getMonth() + 1);
        transaction.update(pledgeRef, { status: "approved", approvedAt: approvalTimestamp.toISOString(), approvedBy: uid });
        transaction.update(userRef, { totalApproved: admin.firestore.FieldValue.increment(1), updatedAt: approvalTimestamp.toISOString(), premiumExpiresAt: premiumExpiresAt });
        const userNotification = {
            userId: pledgeData.userId, type: 'PREMIUM_APPROVED',
            message: `Your NVA Premium subscription is now active!`,
            link: '/CreatorDashboard', isRead: false, timestamp: approvalTimestamp
        };
        transaction.set(notificationsRef.doc(), userNotification);
        // Badge Logic
        transaction.update(userRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(1) });

      } else if (pledgeData.paymentType === 'promotedStatus') {
        transaction.update(pledgeRef, { status: "approved", approvedAt: approvalTimestamp.toISOString(), approvedBy: uid });

        const newStatusRef = db.collection("promotedStatuses").doc();
        transaction.set(newStatusRef, {
            postedByUid: pledgeData.userId,
            status: 'content_pending',
            createdAt: approvalTimestamp,
            startTime: admin.firestore.Timestamp.fromDate(new Date(pledgeData.scheduledStartTime)),
            expiresAt: admin.firestore.Timestamp.fromDate(new Date(pledgeData.scheduledEndTime)),
            pledgeId: pledgeId
        });

        const userNotification = {
            userId: pledgeData.userId,
            type: 'PROMO_BOOKING_CONFIRMED',
            message: `Your Promoted Status booking for ${new Date(pledgeData.scheduledStartTime).toLocaleDateString()} is confirmed! Please submit your ad content.`,
            link: '/PromotedStatus',
            isRead: false,
            timestamp: approvalTimestamp
        };
        transaction.set(notificationsRef.doc(), userNotification);
        // Badge Logic
        transaction.update(userRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
      
      } else if (pledgeData.paymentType === 'eventTicket') {
        const eventId = pledgeData.targetEventId;
        const ticketPrice = pledgeData.amount;
        
        // --- ALL READS MUST HAPPEN FIRST ---
        let eventDoc = null; // Initialize eventDoc
        if (eventId) {
            // THE FIX: Point to the correct master event document.
            const eventDocRef = db.collection("events").doc(eventId);
            eventDoc = await transaction.get(eventDocRef); // Read the master event document.
        }

        // --- ALL WRITES HAPPEN AFTER THE READS ---
        transaction.update(pledgeRef, { status: "approved", approvedAt: approvalTimestamp.toISOString(), approvedBy: uid });
        
        const userNotification = {
            userId: pledgeData.userId, type: 'TICKET_APPROVED',
            message: `Your ticket purchase for "${pledgeData.targetEventTitle || 'the Live Premiere'}" is confirmed!`,
            link: '/Discover',
            isRead: false, timestamp: approvalTimestamp
        };
        transaction.set(notificationsRef.doc(), userNotification);
        // Badge Logic
        transaction.update(userRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(1) });        
        if (eventId) {
            // Grant the user their ticket
            transaction.set(userRef, { purchasedTickets: { [eventId]: true } }, { merge: true });
            
            // Now, check if the master event document exists before updating it.
            if (eventDoc && eventDoc.exists) {
                transaction.update(eventDoc.ref, {
                    ticketsSold: admin.firestore.FieldValue.increment(1),
                    totalRevenue: admin.firestore.FieldValue.increment(ticketPrice)
                });
                // Note: The 'recentPurchases' subcollection can be added here if needed,
                // but the primary fix is updating the main document.
            } else {
                logger.warn(`Pledge approved for eventId '${eventId}', but the master event document was not found. Ticket was granted, but stats were not updated.`);
            }
        }
      } else {
        transaction.update(pledgeRef, { status: "approved", approvedAt: approvalTimestamp.toISOString(), approvedBy: uid });
        transaction.update(userRef, { totalApproved: admin.firestore.FieldValue.increment(1), updatedAt: approvalTimestamp.toISOString() });
      }
    });
    logger.info(`Pledge '${pledgeId}' approved successfully.`);

    // --- START: PUSH NOTIFICATION LOGIC (AFTER TRANSACTION) ---
    const finalPledgeDoc = await db.collection("paymentPledges").doc(pledgeId).get();
    const finalPledgeData = finalPledgeDoc.data();
    
    if (finalPledgeData.paymentType === 'donation') {
        const campaignDoc = await db.collection(`artifacts/${appId}/public/data/campaigns`).doc(finalPledgeData.targetCampaignId).get();
        if (campaignDoc.exists) {
            const campaignData = campaignDoc.data();
            const campaignCreatorId = campaignData.creatorId;
            // Push to Creator
            await sendPushNotification(campaignCreatorId, {
                title: 'Donation Received!',
                body: `${finalPledgeData.userName} donated $${finalPledgeData.amount.toFixed(2)} to your campaign "${finalPledgeData.targetCampaignTitle}"!`,
                link: '/CreatorDashboard'
            });
            // Check if goal was reached to send a second push
            const newRaisedAmount = (campaignData.raised || 0); // Raised amount is already updated by the transaction
            const oldRaisedAmount = newRaisedAmount - (finalPledgeData.amount * (1 - PLATFORM_FEE_PERCENTAGE));
            if (oldRaisedAmount < campaignData.goal && newRaisedAmount >= campaignData.goal) {
                 await sendPushNotification(campaignCreatorId, {
                    title: 'Campaign Goal Reached!',
                    body: `Congratulations! Your campaign "${campaignData.title}" has reached its funding goal!`,
                    link: '/CreatorDashboard'
                });
            }
        }
        // Push to Donor
        await sendPushNotification(finalPledgeData.userId, {
            title: 'Donation Confirmed',
            body: `Your donation of $${finalPledgeData.amount.toFixed(2)} to "${finalPledgeData.targetCampaignTitle}" was approved. Thank you!`,
            link: '/Home'
        });
    } else if (finalPledgeData.paymentType === 'premium') {
        await sendPushNotification(finalPledgeData.userId, {
            title: 'Subscription Activated!',
            body: 'Your NVA Premium subscription is now active!',
            link: '/CreatorDashboard'
        });
    } else if (finalPledgeData.paymentType === 'promotedStatus') {
         await sendPushNotification(finalPledgeData.userId, {
            title: 'Booking Confirmed!',
            body: `Your Promoted Status booking for ${new Date(finalPledgeData.scheduledStartTime).toLocaleDateString()} is confirmed!`,
            link: '/PromotedStatus'
        });
    } else if (finalPledgeData.paymentType === 'eventTicket') {
        await sendPushNotification(finalPledgeData.userId, {
            title: 'Ticket Purchase Confirmed!',
            body: `Your ticket for "${finalPledgeData.targetEventTitle || 'the Live Premiere'}" is confirmed!`,
            link: '/Discover'
        });
    }
    // --- END: PUSH NOTIFICATION LOGIC ---

    return { message: "Pledge approved and all relevant notifications sent." };
  } catch (error) {
    logger.error("Error approving pledge", { error });
    if (error instanceof HttpsError) { throw error; }
    throw new HttpsError("unknown", error.message);
  }
});

// =====================================================================
// =========== FINAL, PRODUCTION DATA INTEGRITY AUDIT TOOL =============
// =====================================================================
exports.runDataIntegrityAudit = onCall(async (request) => {
    if (request.auth.token.admin !== true) {
        throw new HttpsError("permission-denied", "You must be an admin to run the data audit.");
    }

    const uid = request.auth.uid;
    logger.info(`Admin '${uid}' initiated a full data integrity audit and cleanup.`);
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const summary = {
        orphanedDocumentsDeleted: 0,
        orphanedStorageFilesDeleted: 0,
        followerCountsCorrected: 0,
        followingCountsCorrected: 0,
        staleFollowReferencesRemoved: 0
    };

    try {
        const creatorsSnapshot = await db.collection("creators").get();
        const validUserIds = new Set(creatorsSnapshot.docs.map(doc => doc.id));
        logger.info(`Audit Step 1: Found ${validUserIds.size} valid user documents.`);

        // Step 2: Clean up ALL orphaned documents from various collections
        const collectionsToAudit = {
            'content_items': 'creatorId',
            'campaigns': 'creatorId',
            'opportunities': 'postedByUid',
            'promotedStatuses': 'postedByUid',
            'paymentPledges': 'userId',
            'reports': 'reporterId',
            'likes': 'userId',
            'comments': 'userId'
        };

        for (const [col, field] of Object.entries(collectionsToAudit)) {
            const q = db.collectionGroup(col);
            const snapshot = await q.get();
            if (snapshot.empty) continue;

            const batch = db.batch();
            let writeCount = 0;
            snapshot.forEach(doc => {
                if (!validUserIds.has(doc.data()[field])) {
                    summary.orphanedDocumentsDeleted++;
                    batch.delete(doc.ref);
                    writeCount++;
                    if (writeCount >= 499) {
                        batch.commit();
                        batch = db.batch();
                        writeCount = 0;
                    }
                }
            });
            if (writeCount > 0) await batch.commit();
            logger.info(`Audit Step 2: Cleaned up collection group '${col}'.`);
        }

        // Step 3: Clean up orphaned Storage files with logic that handles both folder and filename conventions.
        const storagePrefixes = ['profile_pictures', 'content_thumbnails', 'campaign_thumbnails', 'opportunity_flyers', 'promo_flyers', 'creator_uploads', 'competition_entries'];
        let orphanedFilesDeleted = 0;

        for (const prefix of storagePrefixes) {
            const [files] = await bucket.getFiles({ prefix: `${prefix}/` });
            if (files.length === 0) continue;

            const filesToDelete = [];
            files.forEach(file => {
                const pathParts = file.name.split('/');
                let userIdInPath = null;

                // THE FIX: Check for both storage patterns.
                // Pattern 1: prefix/USER_ID/filename.jpg (e.g., profile_pictures)
                if (pathParts.length > 1) {
                    const potentialUserId = pathParts[1];
                    if (validUserIds.has(potentialUserId)) {
                        // This is a valid file belonging to an active user, do nothing.
                        return; 
                    }
                    // If the folder name is NOT a valid user ID, it might be an orphan.
                    userIdInPath = potentialUserId;
                }

                // Pattern 2: prefix/USER_ID_filename.jpg (e.g., content_thumbnails)
                // This runs only if the folder pattern didn't find a valid user.
                if (!userIdInPath) {
                    const filename = pathParts[pathParts.length - 1];
                    const userIdMatch = filename.split('_')[0];
                    if (validUserIds.has(userIdMatch)) {
                        // This is a valid file, do nothing.
                        return;
                    }
                    userIdInPath = userIdMatch;
                }
                
                // If after checking both patterns, the extracted ID is not in the valid list, mark for deletion.
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
        
        // THIS IS THE FIX: The closing brace for the main 'try' block was moved from here...

        // Step 4: Recalculate all Follower/Following Counts and clean stale references
        for (const doc of creatorsSnapshot.docs) {
            const creatorRef = doc.ref;
            let needsUpdate = false;
            const updates = {};
            
            const followingSnapshot = await creatorRef.collection('following').get();
            let actualFollowingCount = 0;
            let followingBatch = db.batch();
            for (const followingDoc of followingSnapshot.docs) {
                if (validUserIds.has(followingDoc.id)) {
                    actualFollowingCount++;
                } else {
                    summary.staleFollowReferencesRemoved++;
                    followingBatch.delete(followingDoc.ref);
                }
            }
            await followingBatch.commit();

            const followersSnapshot = await creatorRef.collection('followers').get();
            let actualFollowerCount = 0;
            let followersBatch = db.batch();
            for (const followerDoc of followersSnapshot.docs) {
                if (validUserIds.has(followerDoc.id)) {
                    actualFollowerCount++;
                } else {
                    summary.staleFollowReferencesRemoved++;
                    followersBatch.delete(followerDoc.ref);
                }
            }
            await followersBatch.commit();
            
            if (doc.data().followingCount !== actualFollowingCount) {
                updates.followingCount = actualFollowingCount;
                summary.followingCountsCorrected++;
                needsUpdate = true;
            }
             if (doc.data().followerCount !== actualFollowerCount) {
                updates.followerCount = actualFollowerCount;
                summary.followerCountsCorrected++;
                needsUpdate = true;
            }

            if (needsUpdate) {
                await creatorRef.update(updates);
            }
        }
        logger.info(`Audit Step 4: Follower/Following counts corrected.`);

        logger.info("Data integrity audit completed successfully.", summary);
        return { success: true, summary: summary };

    } catch (error) {
        logger.error("Error during data integrity audit:", error);
        throw new HttpsError("internal", "An error occurred during the audit process.", error.message);
    }
    // ...to here, at the end of the function before the 'catch' block.
});

  exports.cleanupDuplicateFCMTokens = onCall(async (request) => {
    if (request.auth.token.admin !== true) {
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

    const finalData = {
        ...contentData,
        creatorId: uid,
        createdAt: new Date().toISOString(),
        viewCount: 0,
        likeCount: 0,
        isFeatured: false,
        isActive: true,
    };

    try {
        await contentRef.add(finalData);
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

        await creatorRef.update({
            pinnedContent: admin.firestore.FieldValue.arrayRemove(contentId)
        });
        
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
    if (!uid || (!request.auth.token.admin && !request.auth.token.authority)) {
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

exports.resetDailyStats = onSchedule("every 24 hours", async (event) => {
    logger.info("Running scheduled job: Resetting daily analytics stats.");
    const db = admin.firestore();
    const creatorsRef = db.collection("creators");

    const today = new Date();
    const isMonday = today.getDay() === 1;

    try {
        const snapshot = await creatorsRef.get();
        if (snapshot.empty) {
            return null;
        }

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
        logger.info(`Reset daily stats for ${snapshot.size} creators. Weekly reset: ${isMonday}`);
        return null;

    } catch (error) {
        logger.error("Error during scheduled stat reset:", { error });
        return null;
    }
});

// This is the reusable core logic for updating top performers.
async function runTopPerformersUpdate() {
    const db = admin.firestore();
    const appId = "production-app-id";

    const settingsRef = db.collection("settings").doc("featuredContentSlots");
    const settingsDoc = await settingsRef.get();
    const slotsData = settingsDoc.exists ? settingsDoc.data() : {};

    const lockedSlots = new Set();
    const featuredCreatorIds = new Set();
    for (let i = 1; i <= 6; i++) {
        const slotKey = `slot_${i}`;
        const slot = slotsData[slotKey];
        // THE FIX: Explicitly check if the slot data is a valid object before accessing properties.
        if (slot && typeof slot === 'object' && slot.isLocked) {
            lockedSlots.add(slotKey);
            // Also ensure content exists and has a creatorId before adding to the set.
            if (slot.content && typeof slot.content === 'object' && slot.content.creatorId) {
                featuredCreatorIds.add(slot.content.creatorId);
            }
        }
    }

    const creatorsSnapshot = await db.collection("creators")
        .orderBy("weeklyViews", "desc")
        .limit(20)
        .get();

    if (creatorsSnapshot.empty) {
        logger.info("No creators found to update top performers.");
        return;
    }

    const updates = {};
    let slotIndex = 1;

    for (const creatorDoc of creatorsSnapshot.docs) {
        if (slotIndex > 6) break;
        const creatorId = creatorDoc.id;
        const slotKey = `slot_${slotIndex}`;
        
        if (lockedSlots.has(slotKey)) {
            slotIndex++;
            continue;
        }

        if (featuredCreatorIds.has(creatorId)) {
            continue;
        }
        
        const contentSnapshot = await db.collection(`artifacts/${appId}/public/data/content_items`)
            .where("creatorId", "==", creatorId)
            .where("isActive", "==", true)
            .orderBy("viewCount", "desc")
            .limit(1)
            .get();

        if (!contentSnapshot.empty) {
            const topContent = contentSnapshot.docs[0].data();
            updates[slotKey] = {
                isLocked: false,
                content: {
                    id: contentSnapshot.docs[0].id,
                    title: topContent.title,
                    creatorId: topContent.creatorId,
                    creatorName: topContent.creatorName,
                    creatorProfilePictureUrl: topContent.creatorProfilePictureUrl || '',
                    customThumbnailUrl: topContent.customThumbnailUrl,
                    embedUrl: topContent.embedUrl,
                    mainUrl: topContent.mainUrl,
                    viewCount: topContent.viewCount || 0,
                    likeCount: topContent.likeCount || 0
                }
            };
            featuredCreatorIds.add(creatorId);
            slotIndex++;
        }
    }
    
    if (Object.keys(updates).length > 0) {
        await settingsRef.set(updates, { merge: true });
        logger.info(`Successfully updated ${Object.keys(updates).length} top performer slots.`);
    }
}

// The original scheduled function now simply calls our reusable logic.
exports.updateTopPerformers = onSchedule("every 24 hours", async (event) => {
    logger.info("Running scheduled job: updateTopPerformers.");
    try {
        await runTopPerformersUpdate();
    } catch (error) {
        logger.error("Error during scheduled updateTopPerformers job:", { error });
    }
    return null;
});

// THIS IS THE NEW, ON-DEMAND FUNCTION FOR THE ADMIN BUTTON
exports.triggerTopPerformersUpdate = onCall(async (request) => {
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.authority)) {
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
    const campaignsSnapshot = await db.collectionGroup("campaigns").get();
    const campaignStatusBreakdown = { pending: 0, active: 0, ended: 0, rejected: 0, cancelled: 0 };
    campaignsSnapshot.forEach(doc => {
        const status = doc.data().status || 'unknown';
        if (campaignStatusBreakdown.hasOwnProperty(status)) {
            campaignStatusBreakdown[status]++;
        }
    });

    const platformStats = {
        totalUsers,
        activeUsers30Days,
        newUsers7Days,
        userRoleBreakdown,
        totalContentItems: contentSnapshot.size,
        campaignStatusBreakdown,
        lastUpdated: new Date().toISOString()
    };
    await db.collection("statistics").doc("platformOverview").set(platformStats);
    logger.info("Successfully completed platform stats aggregation.", { stats: platformStats });
}

exports.updatePlatformStats = onSchedule("every 24 hours", async (event) => {
    logger.info("Starting scheduled job: updatePlatformStats");
    try {
        await runPlatformStatsAggregation();
        return null;
    } catch (error) {
        logger.error("Error in scheduled updatePlatformStats job", { error });
        return null;
    }
});

exports.triggerPlatformStatsUpdate = onCall(async (request) => {
    if (request.auth.token.admin !== true) {
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

exports.onCampaignStatusChange = onDocumentUpdated("artifacts/{appId}/public/data/campaigns/{campaignId}", async (event) => {
    const dataAfter = event.data.after.data();
    const dataBefore = event.data.before.data();
    const creatorId = dataAfter.creatorId;

    if (!creatorId) return null;

    const db = admin.firestore();
    const userRef = db.collection("creators").doc(creatorId);
    let notification;
    let pushPayload;

    if (dataBefore.status === 'pending' && dataAfter.status === 'active') {
        logger.info(`Campaign '${event.params.campaignId}' approved. Notifying creator.`);
        notification = {
            userId: creatorId,
            type: 'CAMPAIGN_APPROVED',
            message: `Congratulations! Your campaign "${dataAfter.title}" has been approved and is now live.`,
            link: '/CreatorDashboard',
            isRead: false,
            timestamp: new Date()
        };
        pushPayload = {
            title: 'Campaign Approved!',
            body: `Your campaign "${dataAfter.title}" is now live.`,
            link: '/CreatorDashboard'
        };
    } else if (dataBefore.status === 'pending' && dataAfter.status === 'rejected') {
        logger.info(`Campaign '${event.params.campaignId}' rejected. Notifying creator.`);
        notification = {
            userId: creatorId,
            type: 'CAMPAIGN_REJECTED',
            message: `Your campaign "${dataAfter.title}" was reviewed but could not be approved.`,
            link: '/CreatorDashboard',
            isRead: false,
            timestamp: new Date()
        };
        pushPayload = {
            title: 'Campaign Update',
            body: `Your campaign "${dataAfter.title}" was not approved.`,
            link: '/CreatorDashboard'
        };
    }

    if (notification && pushPayload) {
        await db.collection("notifications").add(notification);
        await userRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
        await sendPushNotification(creatorId, pushPayload);
    }

    return null;
});

exports.createBroadcast = onCall(async (request) => {
    if (request.auth.token.admin !== true && request.auth.token.authority !== true) {
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
  if (!request.auth || (!request.auth.token.admin && !request.auth.token.authority)) {
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
    try {
        const notificationDoc = await notificationRef.get();
        if (!notificationDoc.exists) {
            return { success: true, message: "Notification already deleted." };
        }
        if (notificationDoc.data().userId !== uid) {
            throw new HttpsError("permission-denied", "You do not have permission to delete this.");
        }
        await notificationRef.delete();
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
    if (deletedPledge.status === 'pending' && deletedPledge.userId) {
        logger.info(`Pledge '${event.params.pledgeId}' was denied. Notifying user.`);
        
        const db = admin.firestore();
        const userId = deletedPledge.userId;
        const userRef = db.collection("creators").doc(userId);

        const denialNotification = {
            userId: userId,
            type: 'PLEDGE_DENIED',
            message: `Your payment pledge of $${deletedPledge.amount.toFixed(2)} was not approved.`,
            link: '/Contact',
            isRead: false,
            timestamp: new Date()
        };
        const pushPayload = {
            title: 'Payment Update',
            body: `Your payment pledge of $${deletedPledge.amount.toFixed(2)} was not approved.`,
            link: '/Contact'
        };

        await db.collection("notifications").add(denialNotification);
        await userRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
        await sendPushNotification(userId, pushPayload);
    }
    return null;
});

exports.onNewFollower = onDocumentCreated("creators/{creatorId}/followers/{followerId}", async (event) => {
    const { creatorId, followerId } = event.params;
    if (creatorId === followerId) return null;
    const db = admin.firestore();
    try {
        const followerDoc = await db.collection("creators").doc(followerId).get();
        if (!followerDoc.exists) return null;
        
        const userToNotifyRef = db.collection("creators").doc(creatorId);
        const followerName = followerDoc.data().creatorName || "A new user";

        const newFollowerNotification = {
            userId: creatorId,
            type: 'NEW_FOLLOWER',
            message: `${followerName} is now following you!`,
            link: '/Followers',
            isRead: false,
            timestamp: new Date()
        };
        const pushPayload = {
            title: 'New Follower!',
            body: `${followerName} is now following you!`,
            link: '/Followers'
        };

        await db.collection("notifications").add(newFollowerNotification);
        await userToNotifyRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
        await sendPushNotification(creatorId, pushPayload);

    } catch (error) {
        logger.error(`Failed to send 'NEW_FOLLOWER' notification to '${creatorId}'`, { error });
    }
    return null;
});

    exports.onPayoutRequestUpdate = onDocumentUpdated("payoutRequests/{requestId}", async (event) => {
    const dataBefore = event.data.before.data();
    const dataAfter = event.data.after.data();
    const creatorId = dataAfter.creatorId;

    if (dataBefore.status !== 'pending' || !creatorId) {
        return null;
    }

    let notification;

    if (dataAfter.status === 'paid') {
        logger.info(`Payout request '${event.params.requestId}' was paid. Notifying creator '${creatorId}'.`);
        notification = {
            userId: creatorId,
            type: 'PAYOUT_PAID',
            message: `Your payout request for "${dataAfter.campaignTitle}" has been processed and paid.`,
            link: '/CreatorDashboard',
            isRead: false,
            timestamp: new Date()
        };
    } else if (dataAfter.status === 'dismissed') {
        logger.info(`Payout request '${event.params.requestId}' was dismissed. Notifying creator '${creatorId}'.`);
        notification = {
            userId: creatorId,
            type: 'PAYOUT_DISMISSED',
            message: `Your payout request for "${dataAfter.campaignTitle}" was dismissed. Please contact support for details.`,
            link: '/Contact',
            isRead: false,
            timestamp: new Date()
        };
    }

    if (notification && pushPayload) {
        await db.collection("notifications").add(notification);
        await userRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
        await sendPushNotification(creatorId, pushPayload);
    }

    return null;
});

   exports.requestCampaignPayout = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to request a payout.");
    }

    const { campaignId, appId, legalName, mmgPhoneNumber } = request.data;
    if (!campaignId || !appId || !legalName || !mmgPhoneNumber) {
        throw new HttpsError("invalid-argument", "Missing required data. The function requires campaignId, appId, legalName, and mmgPhoneNumber.");
    }

    const db = admin.firestore();
    
    try {
        let newRequestId;

        await db.runTransaction(async (transaction) => {
            const campaignRef = db.collection(`artifacts/${appId}/public/data/campaigns`).doc(campaignId);
            const creatorRef = db.collection("creators").doc(uid);
            const payoutRequestQuery = db.collection("payoutRequests").where("campaignId", "==", campaignId).limit(1);

            const [campaignDoc, creatorDoc, existingRequestSnapshot] = await Promise.all([
                transaction.get(campaignRef),
                transaction.get(creatorRef),
                transaction.get(payoutRequestQuery)
            ]);

            if (!campaignDoc.exists) { throw new HttpsError("not-found", "The specified campaign could not be found."); }
            if (!creatorDoc.exists) { throw new HttpsError("not-found", "Your creator profile could not be found."); }
            if (!existingRequestSnapshot.empty) { throw new HttpsError("already-exists", "A payout has already been requested for this campaign."); }

            const campaignData = campaignDoc.data();
            const creatorData = creatorDoc.data();

            if (campaignData.creatorId !== uid) { throw new HttpsError("permission-denied", "You can only request payouts for your own campaigns."); }
            if (campaignData.status !== 'ended') { throw new HttpsError("failed-precondition", "Payouts can only be requested for campaigns that have ended."); }
            if (campaignData.raised < campaignData.goal) { throw new HttpsError("failed-precondition", "The campaign funding goal was not met."); }

            const payoutAmount = Math.round((campaignData.raised * (1 - PLATFORM_FEE_PERCENTAGE)) * 100) / 100;

            const newRequestRef = db.collection("payoutRequests").doc();
            newRequestId = newRequestRef.id;

            // --- THIS IS THE FIX ---
            // The field names now exactly match what the Admin Dashboard expects.
            const newPayoutRequest = {
                creatorId: uid,
                creatorName: creatorData.creatorName || 'N/A',
                legalName: legalName, // Corrected
                mmgPhoneNumber: mmgPhoneNumber, // Corrected
                campaignId: campaignId,
                campaignTitle: campaignData.title,
                amountRaised: campaignData.raised,
                netAmount: payoutAmount, // Corrected
                status: 'pending',
                requestedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            // --- END OF FIX ---

            transaction.set(newRequestRef, newPayoutRequest);
            transaction.update(campaignRef, { payoutStatus: 'requested' });
        });

        logger.info(`User '${uid}' successfully requested payout for campaign '${campaignId}'. New request ID: '${newRequestId}'.`);
        return { success: true, message: "Your payout request has been submitted for review." };

    } catch (error) {
        logger.error(`Error requesting payout for campaign '${campaignId}' by user '${uid}'`, { error });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while submitting your request.");
    }
});
async function endCampaignAndApplyCooldown(campaignRef, campaignData, db) {
    const batch = db.batch();
    batch.update(campaignRef, { status: "ended" });
    const broadcast = {
        broadcastType: "CAMPAIGN_ENDED",
        message: `The campaign "${campaignData.title}" by ${campaignData.creatorName} has concluded.`,
        link: "/AllCampaigns", timestamp: new Date(),
    };
    batch.set(db.collection("broadcast_notifications").doc(), broadcast);

    // Add private notification for the creator
    const creatorNotification = {
        userId: campaignData.creatorId,
        type: 'CAMPAIGN_ENDED',
        message: `Your campaign "${campaignData.title}" has successfully completed.`,
        link: '/CreatorDashboard',
        isRead: false,
        timestamp: new Date()
    };
    batch.set(db.collection("notifications").doc(), creatorNotification);
    const creatorRef = db.collection("creators").doc(campaignData.creatorId);
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() + 30);
    batch.update(creatorRef, { canCreateCampaignAfter: cooldownDate });
    await batch.commit();
    logger.info(`Campaign '${campaignRef.id}' ended. Cooldown applied.`);
}

exports.endCampaignEarly = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) { throw new HttpsError("unauthenticated", "You must be logged in."); }
    const { campaignId, appId } = request.data;
    if (!campaignId || !appId) { throw new HttpsError("invalid-argument", "Missing 'campaignId' or 'appId'."); }
    const db = admin.firestore();
    const campaignRef = db.collection(`artifacts/${appId}/public/data/campaigns`).doc(campaignId);
    try {
        const campaignDoc = await campaignRef.get();
        if (!campaignDoc.exists) { throw new HttpsError("not-found", "Campaign not found."); }
        const campaignData = campaignDoc.data();
        if (campaignData.creatorId !== uid) { throw new HttpsError("permission-denied", "Not the owner."); }
        if (campaignData.status !== 'active') { throw new HttpsError("failed-precondition", "Not active."); }
        if (campaignData.raised < campaignData.goal) { throw new HttpsError("failed-precondition", "Goal not reached."); }
        await endCampaignAndApplyCooldown(campaignRef, campaignData, db);
        return { success: true, message: "Campaign ended successfully!" };
    } catch (error) {
        logger.error(`Error ending campaign '${campaignId}'`, { error });
        if (error instanceof HttpsError) { throw error; }
        throw new HttpsError("unknown", "An error occurred.");
    }
});

        exports.deleteCampaign = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to delete a campaign.");
    }
    const { campaignId, appId } = request.data;
    if (!campaignId || !appId) {
        throw new HttpsError("invalid-argument", "Missing 'campaignId' or 'appId'.");
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const campaignRef = db.collection(`artifacts/${appId}/public/data/campaigns`).doc(campaignId);

    try {
        const campaignDoc = await campaignRef.get();
        if (!campaignDoc.exists) {
            logger.warn(`User '${uid}' tried to delete non-existent campaign '${campaignId}'.`);
            return { success: true, message: "Campaign already deleted." };
        }
        
        const campaignData = campaignDoc.data();

        if (campaignData.creatorId !== uid) {
            throw new HttpsError("permission-denied", "You do not have permission to delete this campaign.");
        }
        
        if (campaignData.status === 'active') {
            throw new HttpsError("failed-precondition", "Active campaigns cannot be deleted. Please end the campaign first.");
        }

        // Delete associated image from Cloud Storage if it exists
        if (campaignData.imageUrl && campaignData.imageUrl.includes('firebasestorage')) {
            try {
                const url = new URL(campaignData.imageUrl);
                const path = decodeURIComponent(url.pathname.split('/o/')[1].split('?')[0]);
                await bucket.file(path).delete();
                logger.info(`Deleted campaign image for '${campaignId}' from Storage.`);
            } catch (e) {
                logger.warn(`Could not delete campaign image for '${campaignId}'. It may have been manually removed.`, e.message);
            }
        }

        await campaignRef.delete();
        logger.info(`User '${uid}' successfully deleted campaign '${campaignId}'.`);
        
        return { success: true, message: "Campaign has been successfully deleted." };

    } catch (error) {
        logger.error(`Error deleting campaign '${campaignId}' for user '${uid}'`, { error });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred during campaign deletion.");
    }
});

exports.checkCampaignExpirations = onSchedule("every 1 hours", async (event) => {
    logger.info("Checking for expired campaigns...");
    const db = admin.firestore();
    const now = new Date();
    const expiredCampaignsQuery = db.collectionGroup("campaigns").where("status", "==", "active").where("endDate", "<=", now.toISOString());
    try {
        const snapshot = await expiredCampaignsQuery.get();
        if (snapshot.empty) return null;
        const batch = db.batch();
        for (const doc of snapshot.docs) {
            const campaignData = doc.data();
            batch.update(doc.ref, { status: "ended" });
            const broadcast = {
                broadcastType: "CAMPAIGN_ENDED",
                message: `The campaign "${campaignData.title}" by ${campaignData.creatorName} has concluded.`,
                link: "/AllCampaigns",
                timestamp: new Date(),
            };
            batch.set(db.collection("broadcast_notifications").doc(), broadcast);

            // Add private notification for the creator
            const creatorNotification = {
                userId: campaignData.creatorId,
                type: 'CAMPAIGN_ENDED_DURATION',
                message: `Your campaign "${campaignData.title}" has reached its end date and is now completed.`,
                link: '/CreatorDashboard',
                isRead: false,
                timestamp: new Date()
            };
            batch.set(db.collection("notifications").doc(), creatorNotification);
            const creatorRef = db.collection("creators").doc(campaignData.creatorId);
            const cooldownDate = new Date();
            cooldownDate.setDate(cooldownDate.getDate() + 30);
            batch.update(creatorRef, { canCreateCampaignAfter: cooldownDate });
        }
        await batch.commit();
        logger.info(`Processed ${snapshot.size} expired campaigns.`);
        return null;
    } catch (error) {
        logger.error("Error during campaign expiration check", { error });
        return null;
    }
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

exports.socialCardRenderer = onRequest({ cors: true }, async (req, res) => {
    const db = admin.firestore();
    const path = req.path; // e.g., /user/someUserId
    const parts = path.split('/').filter(Boolean);
    const rootUrl = `https://${req.hostname}`; // Use req.hostname for dynamic URL

    const defaultTitle = "NVA Network";
    const defaultDescription = "Caribbean Content to a Global Stage.";
    const defaultImage = `${rootUrl}/default-social-image.png`; // A default image in your hosting public folder

    let ogTitle = defaultTitle;
    let ogDescription = defaultDescription;
    let ogImage = defaultImage;
    let ogUrl = rootUrl + path;

    try {
        if (parts.length > 0) {
            const screen = parts[0];
            const id = parts[1];

            if (screen === 'user' && id) {
                const userDoc = await db.collection('creators').doc(id).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    ogTitle = userData.creatorName || defaultTitle;
                    ogDescription = userData.bio || defaultDescription;
                    ogImage = userData.profilePictureUrl || defaultImage;
                }
            } else if (screen === 'competition') {
                const compQuery = query(collection(db, "competitions"), where("status", "in", ["Accepting Entries", "Live Voting", "Judging", "Results Visible"]), orderBy("createdAt", "desc"), limit(1));
                const compSnapshot = await compQuery.get();
                if (!compSnapshot.empty) {
                    const compData = compSnapshot.docs[0].data();
                    ogTitle = compData.title || "NVA Competition";
                    ogDescription = compData.description || defaultDescription;
                    ogImage = compData.flyerImageUrl || defaultImage;
                }
            } else if (screen === 'opportunity' && id) {
                const oppDoc = await db.collection('opportunities').doc(id).get();
                if (oppDoc.exists) {
                    const oppData = oppDoc.data();
                    ogTitle = oppData.title;
                    ogDescription = oppData.description;
                    ogImage = oppData.flyerImageUrl || defaultImage;
                }
            }
            // Add other content types like 'content' here in the future
        }
    } catch (error) {
        logger.error("Error fetching social card data:", { path, error });
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${ogTitle}</title>
          <meta property="og:title" content="${ogTitle}" />
          <meta property="og:description" content="${ogDescription}" />
          <meta property="og:image" content="${ogImage}" />
          <meta property="og:url" content="${ogUrl}" />
          <meta property="og:type" content="website" />
          <script>
            // Redirect non-crawler users to the actual SPA
            window.location.href = "${path}";
          </script>
        </head>
        <body>
          <h1>${ogTitle}</h1>
          <p>${ogDescription}</p>
        </body>
      </html>
    `;

    res.status(200).send(html);
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
            creatorName: newContent.creatorName,
            creatorProfilePictureUrl: newContent.creatorProfilePictureUrl || '',
            title: newContent.title,
            embedUrl: newContent.embedUrl || '',
            mainUrl: newContent.mainUrl || '',
            customThumbnailUrl: newContent.customThumbnailUrl || '',
            createdAt: newContent.createdAt,
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
        await db.runTransaction(async (transaction) => {
            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists) {
                throw new HttpsError("not-found", `The ${itemType} you are trying to like does not exist.`);
            }

            if (isLiking) {
                transaction.set(likeRef, { likedAt: new Date().toISOString() });
            } else {
                transaction.delete(likeRef);
            }
            transaction.update(itemRef, { likeCount: admin.firestore.FieldValue.increment(increment) });
        });
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

exports.clearNewContentFlags = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }

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

exports.setVerifiedAdvertiserStatus = onCall(async (request) => {
    if (request.auth.token.admin !== true) {
      throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }

    const { userId, durationInMonths } = request.data;
    if (!userId || !durationInMonths) {
        throw new HttpsError("invalid-argument", "Missing userId or durationInMonths.");
    }
    
    const db = admin.firestore();
    const userRef = db.collection("creators").doc(userId);

    const now = new Date();
    const expiryDate = new Date(now.setMonth(now.getMonth() + parseInt(durationInMonths)));
    
    await userRef.update({
        isVerifiedAdvertiser: true,
        verifiedAdvertiserExpiresAt: admin.firestore.Timestamp.fromDate(expiryDate)
    });

    return { success: true, message: `User status set to Verified Advertiser for ${durationInMonths} month(s).` };
});

exports.revokeVerifiedAdvertiserStatus = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority) {
      throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }

    const { userId } = request.data;
    if (!userId) {
        throw new HttpsError("invalid-argument", "Missing userId.");
    }

    const db = admin.firestore();
    const userRef = db.collection("creators").doc(userId);

    await userRef.update({
        isVerifiedAdvertiser: false,
        verifiedAdvertiserExpiresAt: admin.firestore.FieldValue.delete()
    });
    
    return { success: true, message: "Verified Advertiser status has been revoked." };
});

exports.cleanupExpiredVerifications = onSchedule("every 24 hours", async (event) => {
    logger.info("Running scheduled job: Cleaning up expired Verified Advertiser statuses.");
    const db = admin.firestore();
    const now = new Date();

    const expiredUsersQuery = db.collection("creators")
        .where("isVerifiedAdvertiser", "==", true)
        .where("verifiedAdvertiserExpiresAt", "<=", now);

    try {
        const snapshot = await expiredUsersQuery.get();
        if (snapshot.empty) {
            logger.info("No expired advertiser statuses found to clean up.");
            return null;
        }

        const batch = db.batch();
        snapshot.forEach(doc => {
            logger.info(`Advertiser status for user '${doc.id}' has expired. Revoking status.`);
            batch.update(doc.ref, {
                isVerifiedAdvertiser: false,
                verifiedAdvertiserExpiresAt: admin.firestore.FieldValue.delete()
            });
        });

        await batch.commit();
        logger.info(`Successfully cleaned up ${snapshot.size} expired advertiser statuses.`);
        return null;

    } catch (error) {
        logger.error("Error during scheduled cleanup of advertiser statuses", { error });
        return null;
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
    if (!request.auth.token.admin && !request.auth.token.authority) {
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
    if (!request.auth.token.admin && !request.auth.token.authority) {
        throw new HttpsError("permission-denied", "You must be a moderator to perform this action.");
    }
    const { contentId, appId, reportIds } = request.data;
    if (!contentId || !appId || !reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
        throw new HttpsError("invalid-argument", "Missing required information.");
    }

    const db = admin.firestore();
    const batch = db.batch();
    
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
        const removalReason = firstReportDoc.exists() ? firstReportDoc.data().reason : "Violation of Community Guidelines";
        const contentCreatorId = contentData.creatorId;

        // 1. Deactivate the content
        batch.update(contentRef, { isActive: false, hasPendingReports: false });

        // 2. Resolve all associated reports
        reportIds.forEach(id => {
            const reportRef = db.collection("reports").doc(id);
            batch.update(reportRef, { status: 'content_removed', resolvedBy: request.auth.uid, resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        
        // 3. Create the appealable notification for the creator
        if (contentCreatorId) {
        const notificationsRef = db.collection("notifications").doc();
        const notification = {
            userId: contentCreatorId,
            type: 'CONTENT_REMOVED',
            message: `Your content "${contentData.title}" was removed. Reason: ${removalReason}.`,
            link: `/AppealContent/${contentId}`, // Special link for the frontend
            isAppealable: true,
            contentId: contentId,
            isRead: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        batch.set(notificationsRef, notification);

        // Badge Logic
        const creatorRef = db.collection("creators").doc(contentCreatorId);
        batch.update(creatorRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
    } else {
        logger.warn(`Content ${contentId} has no creatorId. Cannot send notification.`);
    }

        await batch.commit();
        
        // Push notification after batch commits
    if (contentCreatorId) {
        await sendPushNotification(contentCreatorId, {
            title: 'Content Removed',
            body: `Your content "${contentData.title}" was removed.`,
            link: `/AppealContent/${contentId}`
        });
    }
        
        return { success: true, message: "Content has been removed and the user has been notified." };

    } catch (error) {
        logger.error(`Error in removeReportedContent for content '${contentId}':`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred during content removal.");
    }
});

exports.suspendReportedUser = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority) {
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
        batch.update(contentRef, { hasPendingReports: false });
    }

    reportIds.forEach(id => {
        const reportRef = db.collection("reports").doc(id);
        batch.update(reportRef, { status: 'user_suspended', resolvedBy: request.auth.uid, resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
    });

    await batch.commit();
    return { success: true, message: `User has been suspended for ${durationHours} hours.` };
});

exports.suspendUserDirectly = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority) {
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
    if (!request.auth.token.admin && !request.auth.token.authority) {
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
    if (!request.auth.token.admin && !request.auth.token.authority) {
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
    if (!uid || (!request.auth.token.admin && !request.auth.token.authority)) {
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
    if (!uid || (!request.auth.token.admin && !request.auth.token.authority)) {
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

exports.createOpportunity = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in to post an opportunity.");
    }

    const data = request.data;
    const requiredFields = ['title', 'providerName', 'opportunityType', 'compensationType', 'equipmentProvided', 'location', 'description', 'howToApply', 'listingDuration'];
    for (const field of requiredFields) {
        if (!data[field]) {
            throw new HttpsError("invalid-argument", `Missing required field: ${field}`);
        }
    }

    logger.info(`User '${uid}' attempting to create opportunity: "${data.title}"`);
    const db = admin.firestore();
    const creatorRef = db.collection("creators").doc(uid);
    const creatorDoc = await creatorRef.get();
    if (!creatorDoc.exists) {
        throw new HttpsError("not-found", "Your creator profile could not be found.");
    }
    const creatorData = creatorDoc.data();

    const isPremium = creatorData.premiumExpiresAt && creatorData.premiumExpiresAt.toDate() > new Date();
    const isVerified = creatorData.isVerifiedAdvertiser === true;

    if (!isPremium && !isVerified) {
        throw new HttpsError("permission-denied", "Posting opportunities is a Premium feature.");
    }

    if (!isVerified) {
        const existingListingsQuery = db.collection("opportunities").where("postedByUid", "==", uid).where("status", "in", ["active", "pending"]);
        const existingListingsSnapshot = await existingListingsQuery.get();
        if (!existingListingsSnapshot.empty) {
            throw new HttpsError("already-exists", "You already have an active or pending opportunity.");
        }
    }
    
    const createdAt = admin.firestore.FieldValue.serverTimestamp();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(data.listingDuration, 10));

    const newOpportunity = {
        ...data,
        postedByUid: uid,
        status: 'pending',
        createdAt: createdAt,
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        viewCount: 0,
        applyClickCount: 0,
        listingTier: data.listingTier === 'promoted' && isVerified ? 'promoted' : 'standard'
    };
    
    const newDocRef = await db.collection("opportunities").add(newOpportunity);
    logger.info(`Successfully created pending opportunity for user '${uid}' with ID '${newDocRef.id}'.`);

    if (!isVerified) {
        const allListingsQuery = db.collection("opportunities").where("postedByUid", "==", uid).orderBy("createdAt", "desc");
        const allListingsSnapshot = await allListingsQuery.get();
        if (allListingsSnapshot.size > 10) {
            const batch = db.batch();
            const listingsToDelete = allListingsSnapshot.docs.slice(10);
            listingsToDelete.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            logger.info(`Cleaned up ${listingsToDelete.length} old listings for user '${uid}'.`);
        }
    }

    return { success: true, message: "Your opportunity has been submitted for review.", opportunityId: newDocRef.id };
});

exports.approveOpportunity = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority) {
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

    await opportunityRef.update({ status: 'active' });

    const posterId = opportunityDoc.data().postedByUid;
    const notification = {
        userId: posterId,
        type: 'OPPORTUNITY_APPROVED',
        message: `Congratulations! Your opportunity "${opportunityDoc.data().title}" is now live.`,
        link: '/CreatorDashboard',
        isRead: false,
        timestamp: new Date()
    };
    await db.collection("notifications").add(notification);

    return { success: true, message: "Opportunity approved and is now live." };
});

exports.rejectOpportunity = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority) {
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
    const notification = {
        userId: posterId,
        type: 'OPPORTUNITY_REJECTED',
        message: `Your opportunity "${opportunityDoc.data().title}" was not approved.`,
        link: '/CreatorDashboard',
        isRead: false,
        timestamp: new Date()
    };
    await db.collection("notifications").add(notification);

    return { success: true, message: "Opportunity rejected. The user has been notified." };
});

exports.endOpportunityByAdmin = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority) {
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

    if (opportunityDoc.data().status !== 'active') {
        throw new HttpsError("failed-precondition", "This listing is not currently active.");
    }

    await opportunityRef.update({ status: 'expired' });

const posterId = opportunityDoc.data().postedByUid;
const posterRef = db.collection("creators").doc(posterId);
const notification = {
    userId: posterId,
    type: 'OPPORTUNITY_ENDED_BY_ADMIN',
    message: `Your opportunity "${opportunityDoc.data().title}" was ended by a moderator.`,
    link: '/MyListings',
    isRead: false,
    timestamp: new Date()
};
const pushPayload = {
    title: 'Listing Update',
    body: `Your opportunity "${opportunityDoc.data().title}" was ended by a moderator.`,
    link: '/MyListings'
};

await db.collection("notifications").add(notification);
await posterRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
await sendPushNotification(posterId, pushPayload);

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
    const opportunityRef = db.collection("opportunities").doc(opportunityId);
    
    const opportunityDoc = await opportunityRef.get();
    if (!opportunityDoc.exists) {
        throw new HttpsError("not-found", "The listing you are trying to delete does not exist.");
    }

    if (opportunityDoc.data().postedByUid !== uid) {
        throw new HttpsError("permission-denied", "You do not have permission to delete this listing.");
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

exports.getNextAvailableStatusSlot = onCall(async (request) => {
    const db = admin.firestore();
    const statusesRef = db.collection("promotedStatuses");
    const now = new Date();

    const q = statusesRef.orderBy("expiresAt", "desc").limit(1);
    const snapshot = await q.get();

    if (snapshot.empty) {
        return { nextAvailable: now.toISOString() };
    }

    const lastBooking = snapshot.docs[0].data();
    const lastExpiry = lastBooking.expiresAt.toDate();

    if (lastExpiry < now) {
        return { nextAvailable: now.toISOString() };
    } else {
        return { nextAvailable: lastExpiry.toISOString() };
    }
});

exports.rejectStatusContent = onCall(async (request) => {
    if (!request.auth.token.admin && !request.auth.token.authority) {
      throw new HttpsError("permission-denied", "You must be an admin to reject content.");
    }
    const { bookingId } = request.data;
    if (!bookingId) { throw new HttpsError("invalid-argument", "Missing bookingId."); }

    const db = admin.firestore();
    const bookingRef = db.collection("promotedStatuses").doc(bookingId);

    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) {
        throw new HttpsError("not-found", "Booking not found.");
    }
    
    await bookingRef.update({ status: 'content_pending' });

const posterId = bookingDoc.data().postedByUid;
const posterRef = db.collection("creators").doc(posterId);
const notification = {
    userId: posterId,
    type: 'PROMO_CONTENT_REJECTED',
    message: `Your submitted content for the Promoted Status on ${bookingDoc.data().startTime.toDate().toLocaleDateString()} was not approved. Please submit new content.`,
    link: '/PromotedStatus',
    isRead: false,
    timestamp: new Date()
};
const pushPayload = {
    title: 'Ad Content Rejected',
    body: 'Your submitted ad content was not approved. Please submit new content.',
    link: '/PromotedStatus'
};

await db.collection("notifications").add(notification);
await posterRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
await sendPushNotification(posterId, pushPayload);

return { success: true, message: "Content rejected. The advertiser has been notified to resubmit." };
});

exports.endPromotedStatusByAdmin = onCall(async (request) => {
    if (request.auth.token.admin !== true) {
      throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }
    const { bookingId } = request.data;
    if (!bookingId) { throw new HttpsError("invalid-argument", "Missing bookingId."); }

    const db = admin.firestore();
    const bookingRef = db.collection("promotedStatuses").doc(bookingId);

    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) { throw new HttpsError("not-found", "Booking not found."); }

    await bookingRef.update({ status: 'expired' });

const posterId = bookingDoc.data().postedByUid;
const posterRef = db.collection("creators").doc(posterId);
const notification = {
    userId: posterId,
    type: 'PROMO_ENDED_BY_ADMIN',
    message: `Your Promoted Status for ${bookingDoc.data().startTime.toDate().toLocaleDateString()} was ended by a moderator.`,
    link: '/PromotedStatus',
    isRead: false,
    timestamp: new Date()
};
const pushPayload = {
    title: 'Ad Status Update',
    body: `Your Promoted Status for ${bookingDoc.data().startTime.toDate().toLocaleDateString()} was ended by a moderator.`,
    link: '/PromotedStatus'
};

await db.collection("notifications").add(notification);
await posterRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
await sendPushNotification(posterId, pushPayload);

return { success: true, message: "Promoted Status has been taken down." };
});

exports.createBookingAndPledge = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    
    const { bookingDetails, contentDetails } = request.data;
    if (!bookingDetails) {
        throw new HttpsError("invalid-argument", "Missing booking details.");
    }

    const db = admin.firestore();
    const creatorRef = db.collection("creators").doc(uid);
    
    try {
        const creatorDoc = await creatorRef.get();
        if (!creatorDoc.exists) {
            throw new HttpsError("not-found", "Your creator profile was not found.");
        }

        const { scheduledStartTime, scheduledEndTime, price, sourceOpportunityId } = bookingDetails;
        let finalTitle, finalMainUrl, finalFlyerImageUrl;

        if (sourceOpportunityId) {
            logger.info(`User '${uid}' is creating a booking from source opportunity '${sourceOpportunityId}'.`);
            const opportunityRef = db.collection("opportunities").doc(sourceOpportunityId);
            const opportunityDoc = await opportunityRef.get();

            if (!opportunityDoc.exists) {
                throw new HttpsError("not-found", "The source opportunity listing could not be found.");
            }
            const opportunityData = opportunityDoc.data();

            if (opportunityData.postedByUid !== uid) {
                throw new HttpsError("permission-denied", "You do not have permission to promote this listing.");
            }

            finalTitle = opportunityData.title;
            finalFlyerImageUrl = opportunityData.flyerImageUrl || ''; // Ensure fallback
            finalMainUrl = opportunityData.mainUrl || ''; // Ensure fallback
        } else {
            logger.info(`User '${uid}' is creating a booking with new content.`);
            if (!contentDetails) {
                throw new HttpsError("invalid-argument", "Missing content details for a new booking.");
            }
            const { title, mainUrl, flyerImageUrl } = contentDetails;
            if (!title) {
                throw new HttpsError("invalid-argument", "Content details are incomplete. An Ad Title is required.");
            }
            finalTitle = title;
            finalMainUrl = mainUrl || ''; // Provide a fallback to prevent 'undefined'
            finalFlyerImageUrl = flyerImageUrl || ''; // Provide a fallback to prevent 'undefined'
        }

        const pledgeId = `NVA-${Date.now().toString().slice(-6).toUpperCase()}`;
        const pledgeRef = db.collection("paymentPledges").doc(pledgeId);
        const newStatusRef = db.collection("promotedStatuses").doc();

        await db.runTransaction(async (transaction) => {
            transaction.set(pledgeRef, {
                pledgeId,
                userId: uid,
                userName: creatorDoc.data().creatorName || "N/A",
                userEmail: creatorDoc.data().email,
                paymentType: 'promotedStatus',
                amount: price,
                status: 'pending',
                targetEventTitle: `Promoted Status Booking for ${new Date(scheduledStartTime).toLocaleDateString()}`,
                scheduledStartTime: scheduledStartTime,
                scheduledEndTime: scheduledEndTime,
                createdAt: new Date().toISOString()
            });

            const isVideoUrl = finalMainUrl.includes("youtube.com") || finalMainUrl.includes("youtu.be") || finalMainUrl.includes("vimeo.com") || finalMainUrl.includes("tiktok.com");

            transaction.set(newStatusRef, {
                postedByUid: uid,
                status: 'content_review_pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                startTime: admin.firestore.Timestamp.fromDate(new Date(scheduledStartTime)),
                expiresAt: admin.firestore.Timestamp.fromDate(new Date(scheduledEndTime)),
                pledgeId: pledgeId,
                content: {
                    title: finalTitle,
                    destinationUrl: isVideoUrl ? '' : finalMainUrl,
                    adVideoUrl: isVideoUrl ? finalMainUrl : '',
                    flyerImageUrl: finalFlyerImageUrl
                },
                contentSubmittedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return { pledgeId: pledgeId };

    } catch (error) {
        logger.error(`Error in createBookingAndPledge for user '${uid}'`, { error });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred during the booking process.");
    }
});

exports.cleanupOldBookings = onSchedule("every 24 hours", async (event) => {
    logger.info("Running scheduled job: Cleaning up old promoted status bookings...");
    const db = admin.firestore();
    const retentionDays = 30;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);

    const oldBookingsQuery = db.collection("promotedStatuses")
        .where("status", "in", ["expired", "cancelled"])
        .where("startTime", "<", cutoffTimestamp);

    try {
        const snapshot = await oldBookingsQuery.get();
        if (snapshot.empty) {
            logger.info("No old bookings found to clean up.");
            return null;
        }

        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        logger.info(`Successfully cleaned up and deleted ${snapshot.size} old booking documents.`);
        return null;

    } catch (error) {
        logger.error("Error during scheduled cleanup of old bookings", { error });
        return null;
    }
});

exports.deleteBooking = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const { bookingId } = request.data;
    if (!bookingId) {
        throw new HttpsError("invalid-argument", "Missing bookingId.");
    }

    const db = admin.firestore();
    const bookingRef = db.collection("promotedStatuses").doc(bookingId);
    
    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) {
        return { success: true, message: "Booking already deleted." };
    }

    if (bookingDoc.data().postedByUid !== uid) {
        throw new HttpsError("permission-denied", "You do not have permission to delete this booking.");
    }

    await bookingRef.delete();
    
    return { success: true, message: "Booking has been deleted." };
});

exports.createCompetition = onCall(async (request) => {
    if (request.auth.token.admin !== true) {
      throw new HttpsError("permission-denied", "You must be an admin to create a competition.");
    }
    
    const { competitionData } = request.data;
    if (!competitionData || !competitionData.title) {
        throw new HttpsError("invalid-argument", "Missing competition data or title.");
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    logger.info(`Admin '${request.auth.uid}' is creating competition: "${competitionData.title}"`);
    
    try {
        const competitionRef = db.collection("competitions").doc();
        
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
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
    if (request.auth.token.admin !== true) {
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

    const { entryData } = request.data;
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
         if (competitionData.entryDeadline) {
            // This is the fix. It correctly converts the stored data (whether it's a Timestamp or a string)
            // into a Firestore Timestamp object for a reliable, direct comparison.
            const deadlineTimestamp = competitionData.entryDeadline.toDate ? competitionData.entryDeadline : admin.firestore.Timestamp.fromDate(new Date(competitionData.entryDeadline));
            
            // This comparison is timezone-safe.
            if (deadlineTimestamp < admin.firestore.Timestamp.now()) {
                throw new HttpsError("failed-precondition", "The entry deadline for this competition has passed.");
            }
        }

        const entryRef = competitionRef.collection("entries").doc(uid);
        transaction.set(entryRef, {
            ...entryData,
            userId: uid,
            userName: creatorData.creatorName || creatorData.email,
            userProfilePicture: creatorData.profilePictureUrl || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            likeCount: 0,
            viewCount: 0
        });

        transaction.update(competitionRef, {
            entryCount: admin.firestore.FieldValue.increment(1)
        });

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

exports.checkResultsRevelations = onSchedule("every 1 minutes", async (event) => {
    logger.info("Running scheduled job: Checking for competition results to reveal...");
    const db = admin.firestore();
    const now = new Date();

    const competitionsToRevealQuery = db.collection("competitions")
        .where("status", "==", "Judging")
        .where("resultsRevealTime", "<=", now);

    try {
        const snapshot = await competitionsToRevealQuery.get();
        if (snapshot.empty) {
            return null;
        }

        const batch = db.batch();
        snapshot.forEach(doc => {
            const competitionData = doc.data();
            logger.info(`Competition '${doc.id}' timer has expired. Setting status to 'Results Visible'.`);
            batch.update(doc.ref, { status: "Results Visible" });
            
            const broadcast = {
                broadcastType: "COMPETITION_RESULTS",
                message: `The results for the competition "${competitionData.title}" are in! See who won.`,
                link: "/CompetitionScreen",
                timestamp: new Date()
            };
            batch.set(db.collection("broadcast_notifications").doc(), broadcast);
        });

        await batch.commit();
        logger.info(`Successfully revealed and notified results for ${snapshot.size} competitions.`);
        return null;

    } catch (error) {
        logger.error("Error during scheduled results revelation check", { error });
        return null;
    }
});

exports.deleteCompetition = onCall(async (request) => {
    if (request.auth.token.admin !== true) {
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
            const flyerPath = getPathFromUrl(competitionDoc.data().flyerImageUrl);
            if (flyerPath) {
                await bucket.file(flyerPath).delete().catch(e => logger.error(`Non-fatal: Failed to delete main flyer: ${flyerPath}`, e));
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

exports.checkCompetitionStatusTransitions = onSchedule("every 10 minutes", async (event) => {
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
exports.manageEventStatus = onSchedule("every 1 minutes", async (event) => {
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
    if (!request.auth || !request.auth.token.admin) {
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

    // Enforce cooldown if the user is NOT an admin or authority.
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
    const itemTitle = itemData.title || itemData.eventTitle || "your post"; // Get title from any possible field

    // --- THIS IS THE FIX ---
    // Determine the user's role and add it to the comment object.
    let authorRole = 'user'; // Default role
    if (request.auth.token.admin === true) {
        authorRole = 'admin';
    } else if (request.auth.token.authority === true) {
        authorRole = 'authority';
    }

    const newComment = {
        userId: uid,
        userName: creatorData.creatorName || "NVA User",
        userProfilePicture: creatorData.profilePictureUrl || '',
        text: text.trim(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        replyTo: replyTo || null,
        authorRole: authorRole // The new field is added here.
    };
    // --- END OF FIX ---

    const commentsRef = itemRef.collection("comments");

let ownerPushPayload = null;
let replyPushPayload = null;

await db.runTransaction(async (transaction) => {
    const newCommentRef = commentsRef.doc();
    transaction.set(newCommentRef, newComment);
    transaction.update(creatorRef, { lastCommentTimestamp: admin.firestore.FieldValue.serverTimestamp() });
    transaction.update(itemRef, { commentCount: admin.firestore.FieldValue.increment(1) });
    const notificationsRef = db.collection("notifications");
    
    const contentOwnerId = itemData.creatorId || itemData.postedByUid;

    if (contentOwnerId && contentOwnerId !== uid) {
        const ownerNotification = {
            userId: contentOwnerId,
            type: 'NEW_COMMENT',
            message: `${creatorData.creatorName} commented on ${itemTitle}`,
            link: itemType === 'content' ? '/MyContentLibrary' : '/MyListings',
            isRead: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        transaction.set(notificationsRef.doc(), ownerNotification);
        
        const ownerRef = db.collection("creators").doc(contentOwnerId);
        transaction.update(ownerRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(1) });

        ownerPushPayload = { // Prepare the push payload
            userId: contentOwnerId,
            title: 'New Comment',
            body: `${creatorData.creatorName} commented on ${itemTitle}`,
            link: itemType === 'content' ? '/MyContentLibrary' : '/MyListings'
        };
    }

    if (replyTo && replyTo.userId && replyTo.userId !== uid && replyTo.userId !== contentOwnerId) {
         const replyNotification = {
            userId: replyTo.userId,
            type: 'COMMENT_REPLY',
            message: `${creatorData.creatorName} replied to your comment on ${itemTitle}`,
            link: itemType === 'content' ? '/MyContentLibrary' : '/MyListings',
            isRead: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        transaction.set(notificationsRef.doc(), replyNotification);

        const replyToRef = db.collection("creators").doc(replyTo.userId);
        transaction.update(replyToRef, { unreadNotificationCount: admin.firestore.FieldValue.increment(1) });

        replyPushPayload = { // Prepare the push payload
            userId: replyTo.userId,
            title: 'New Reply',
            body: `${creatorData.creatorName} replied to your comment on ${itemTitle}`,
            link: itemType === 'content' ? '/MyContentLibrary' : '/MyListings'
        };
    }
});

// Send push notifications AFTER the transaction has successfully completed.
if (ownerPushPayload) {
    await sendPushNotification(ownerPushPayload.userId, ownerPushPayload);
}
if (replyPushPayload) {
    await sendPushNotification(replyPushPayload.userId, replyPushPayload);
}

const snapshot = await commentsRef.count().get();
const count = snapshot.data().count;
if (count > 500) {
    const oldestCommentQuery = commentsRef.orderBy('createdAt', 'asc').limit(1);
    const oldestCommentSnapshot = await oldestCommentQuery.get();
    if (!oldestCommentSnapshot.empty) {
        const oldestCommentId = oldestCommentSnapshot.docs[0].id;
        await commentsRef.doc(oldestCommentId).delete();
        logger.info(`Culled oldest comment from item '${itemId}' to maintain count limit.`);
    }
}

return { success: true, message: "Comment posted." };
});

exports.submitStatusContent = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const { bookingId, title, destinationUrl, adVideoUrl, flyerImageUrl } = request.data;
    if (!bookingId || !title) {
        throw new HttpsError("invalid-argument", "Missing bookingId or title.");
    }

    const db = admin.firestore();
    const bookingRef = db.collection("promotedStatuses").doc(bookingId);
    
    return db.runTransaction(async (transaction) => {
        const bookingDoc = await transaction.get(bookingRef);
        if (!bookingDoc.exists) {
            throw new HttpsError("not-found", "The specified booking was not found.");
        }
        
        const bookingData = bookingDoc.data();
        if (bookingData.postedByUid !== uid) {
            throw new HttpsError("permission-denied", "You do not own this booking.");
        }
        if (bookingData.status !== 'content_pending') {
            throw new HttpsError("failed-precondition", "Content has already been submitted for this booking.");
        }

        transaction.update(bookingRef, {
            status: 'content_review_pending',
            content: { title, destinationUrl, adVideoUrl, flyerImageUrl },
            contentSubmittedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, message: "Content submitted for review." };
    });
});

exports.approveStatusContent = onCall(async (request) => {
    if (request.auth.token.admin !== true) {
      throw new HttpsError("permission-denied", "You must be an admin to approve content.");
    }
    const { bookingId } = request.data;
    if (!bookingId) { throw new HttpsError("invalid-argument", "Missing bookingId."); }

    const db = admin.firestore();
    const bookingRef = db.collection("promotedStatuses").doc(bookingId);

    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) {
        throw new HttpsError("not-found", "Booking not found.");
    }
    if (bookingDoc.data().status !== 'content_review_pending') {
        throw new HttpsError("failed-precondition", "This booking is not pending content review.");
    }

    await bookingRef.update({ status: 'approved_and_scheduled' });

const posterId = bookingDoc.data().postedByUid;
const posterRef = db.collection("creators").doc(posterId);
const notification = {
    userId: posterId,
    type: 'PROMO_CONTENT_APPROVED',
    message: `Your content for the Promoted Status on ${bookingDoc.data().startTime.toDate().toLocaleDateString()} has been approved!`,
    link: '/PromotedStatus',
    isRead: false,
    timestamp: new Date()
};
const pushPayload = {
    title: 'Ad Content Approved!',
    body: `Your ad for ${bookingDoc.data().startTime.toDate().toLocaleDateString()} has been approved!`,
    link: '/PromotedStatus'
};

await db.collection("notifications").add(notification);
await posterRef.update({ unreadNotificationCount: admin.firestore.FieldValue.increment(1) });
await sendPushNotification(posterId, pushPayload);

return { success: true, message: "Promoted content approved and scheduled." };
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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.authority)) {
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
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.authority)) {
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
    if (!request.auth || (!request.auth.token.admin && !request.auth.token.authority)) {
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
    if (!request.auth || request.auth.token.admin !== true) {
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
    if (!uid || (!request.auth.token.admin && !request.auth.token.authority)) {
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

        // --- REVISED STEP 4: Manually delete known sub-collections before deleting the main document ---
        const userRef = db.collection('creators').doc(uid);
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
    if (!request.auth || request.auth.token.admin !== true) {
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
    if (!request.auth || request.auth.token.admin !== true) {
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
// ============= END: NEW DESTRUCTIVE DELETE USER FUNCTION =============
// =====================================================================

    exports.changeUserRole = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid || (!request.auth.token.admin && !request.auth.token.authority)) {
        throw new HttpsError("permission-denied", "You must be a moderator to change user roles.");
    }

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
        const isCallerAdmin = request.auth.token.admin === true;
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
        const claims = {
            admin: newRole === 'admin',
            authority: newRole === 'authority'
        };

        // 2. Set the custom claims on the user's authentication token.
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
    if (!request.auth || request.auth.token.admin !== true) {
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
// =========== UTILITY FUNCTION TO SET ADMIN CUSTOM CLAIM ==============
// =====================================================================
exports.setAdminClaim = onCall(async (request) => {
    // Security Check: Only an existing admin can make another admin.
    if (request.auth.token.admin !== true) {
      throw new HttpsError("permission-denied", "You must be an admin to perform this action.");
    }
    const { targetUid } = request.data;
    if (!targetUid) {
      throw new HttpsError("invalid-argument", "Missing targetUid.");
    }
    try {
      await admin.auth().setCustomUserClaims(targetUid, { admin: true });
      logger.info(`Admin '${request.auth.uid}' successfully set admin claim for user '${targetUid}'.`);
      return { success: true, message: `Admin claim set for user ${targetUid}.` };
    } catch (error) {
      logger.error(`Error setting admin claim for ${targetUid}:`, error);
      throw new HttpsError("internal", "An error occurred while setting the custom claim.");
    }
});

    exports.setAuthorityClaim = onCall(async (request) => {
    // Security Check: Only an admin can grant authority status.
    if (request.auth.token.admin !== true) {
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

    // =====================================================================
// =========== START: NOTIFICATION BADGE & PUSH SYSTEM =================
// =====================================================================

// Internal helper function to handle sending push notifications.
const sendPushNotification = async (userId, payload) => {
    const db = admin.firestore();
    const userRef = db.collection("creators").doc(userId);

    try {
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            logger.warn(`Cannot send push notification to non-existent user: ${userId}`);
            return;
        }

        const tokens = userDoc.data().fcmTokens || [];
        if (tokens.length === 0) {
            return; // No tokens, nothing to do.
        }

        // Use sendEachForMulticast which is robust and provides detailed results.
        const message = {
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: {
                link: payload.link || '/',
            },
            tokens: tokens,
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        
        // --- THIS IS THE FIX: Cleanup logic for stale/invalid tokens ---
        const tokensToDelete = [];
        response.responses.forEach((result, index) => {
            if (!result.success) {
                const error = result.error;
                logger.warn(`Failed to send notification to a token for user ${userId}`, { errorCode: error.code });
                if (error.code === 'messaging/registration-token-not-registered' ||
                    error.code === 'messaging/invalid-registration-token') {
                    // This token is invalid, so we schedule it for deletion.
                    tokensToDelete.push(tokens[index]);
                }
            }
        });

        if (tokensToDelete.length > 0) {
            // Remove the invalid tokens from the user's document.
            await userRef.update({
                fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToDelete)
            });
            logger.info(`Cleaned up ${tokensToDelete.length} stale push tokens for user ${userId}.`);
        }

    } catch (error) {
        // This log will now only catch fatal errors, not individual token failures.
        logger.error(`A fatal error occurred while sending push notifications to user ${userId}`, {
            errorMessage: error.message,
            errorCode: error.code,
            fullError: JSON.stringify(error)
        });
    }
};

// Called by the frontend to save a device's push notification token.
exports.saveFCMToken = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const { token } = request.data;
    if (!token) {
        throw new HttpsError("invalid-argument", "Missing FCM token.");
    }
    const userRef = admin.firestore().collection("creators").doc(uid);
    await userRef.update({
        fcmTokens: admin.firestore.FieldValue.arrayUnion(token)
    });
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

    // Reset the counter first for immediate UI feedback.
    await userRef.update({ unreadNotificationCount: 0 });

    // In the background, mark all the documents as read.
    const query = notificationsRef.where("userId", "==", uid).where("isRead", "==", false);
    const snapshot = await query.get();
    if (snapshot.empty) {
        return { success: true, message: "No unread notifications to mark." };
    }
    const batch = db.batch();
    snapshot.forEach(doc => {
        batch.update(doc.ref, { isRead: true });
    });
    await batch.commit();

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

exports.markToastAsSeen = onCall(async (request) => {
    const uid = request.auth.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const { notificationId } = request.data;
    if (!notificationId) {
        throw new HttpsError("invalid-argument", "Missing notificationId.");
    }

    const db = admin.firestore();
    try {
        const seenRef = db.doc(`creators/${uid}/seenNotifications/${notificationId}`);
        await seenRef.set({ seenAt: new Date() });
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
            const docSnap = await db.doc(`artifacts/${appId}/public/data/content_items/${id}`).get();
            if (docSnap.exists) {
                const data = docSnap.data();
                ogTitle = data.title;
                ogDescription = data.description;
                ogImage = data.customThumbnailUrl || data.thumbnailUrl || ogImage;
                debugMessage = `<!-- NVA DEBUG: Rendered content_item: ${id} -->`;
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
        } else if (screen === 'user' && id) { // <-- NEW LOGIC
            const docSnap = await db.doc(`creators/${id}`).get();
            if (docSnap.exists) {
                const data = docSnap.data();
                ogTitle = data.creatorName || "NVA Network Profile";
                ogDescription = data.bio || ogDescription;
                ogImage = data.profilePictureUrl || ogImage;
                debugMessage = `<!-- NVA DEBUG: Rendered user profile: ${id} -->`;
            }
        } else if (screen === 'competition') {
            const querySnap = await db.collection("competitions").where("status", "in", ["Accepting Entries", "Live Voting"]).orderBy("createdAt", "desc").limit(1).get();
            if (!querySnap.empty) {
                const data = querySnap.docs[0].data();
                ogTitle = data.title;
                ogDescription = data.description;
                ogImage = data.flyerImageUrl || ogImage;
                debugMessage = `<!-- NVA DEBUG: Rendered active competition: ${querySnap.docs[0].id} -->`;
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
// --- END: Robust, Multi-Screen Social Share Renderer (SSR) v3 ---