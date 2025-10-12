// src/components/PrivacyPolicyScreen.jsx
import React from 'react';

const PrivacyPolicyScreen = ({ setActiveScreen }) => {
    return (
        <div className="screenContainer" style={{ textAlign: 'left', paddingBottom: '80px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <button onClick={() => window.history.back()} className="backButton">
                    &#x2190; Back
                </button>
                <p className="heading" style={{ margin: 0, flexGrow: 1, textAlign: 'center' }}>Privacy Policy</p>
                <div style={{ width: '70px' }}></div> {/* Spacer */}
            </div>

            <div className="dashboardSection" style={{ padding: '20px', lineHeight: 1.6 }}>
                <p className="paragraph" style={{ fontStyle: 'italic', color: '#AAA' }}>Last updated: [Enter Your Date Here]</p>
                
                <p className="heading small">1. Data We Collect</p>
                <p className="paragraph"><strong>Direct User Input:</strong></p>
                <p className="paragraph">
                    Account Information: We collect an email address and password for authentication. We also collect a creator name, which may be different from a legal name.
                    Public Profile Information: We collect and store a bio, user-selected categories, links to existing Work, profile picture url, and a featured video Link.
                    User-Generated Content (UGC): We collect and store all content users create, including: Campaigns (title, description, goal, image url), Opportunities (title, provider name, location, compensation type), Promoted Statuses (title, flyer image url, ad Video url, destination url), Comments on various content types, Likes on various content types, and Profile pinned Content.
                    Financial Information: The application facilitates financial pledges (payment Pledges) and creator payouts (payout Requests). However, we do not store sensitive financial data like credit card or bank account numbers directly. We use a third-party payment processor; Mobile Money Guyana (MMG) handles the sensitive data. All donations are made via MMG and paid via MMG.
                    Communications: We collect and store user reports on content and messages submitted through the contact form (contact Submissions). We also store appeals from users (appeals).
                </p>
                <p className="paragraph"><strong>Automatically Collected Data:</strong></p>
                <p className="paragraph">
                    Usage Data: We actively track last Login Timestamp, last Submission Timestamp, and last Comment Timestamp. We also have a system to increment a click count on opportunity listings (increment Opportunity Apply Click). We collect usage metrics.
                    Device & Connection Data: We use Firebase, which means we inherently collect user IP addresses for security and logging within Google Cloud's infrastructure. Standard web server logs will also contain browser type, device type, and operating system information.
                    Local Storage: The application uses session Storage to keep track of which notification toasts a user has seen during a single session (processed Toast Ids) to prevent them from re-appearing on page reload.
                </p>

                <p className="heading small">2. How We Use Your Data</p>
                <p className="paragraph">
                    To Provide the Service: All collected profile data and UGC is used to display content to other users, run campaigns, list opportunities, and allow user interaction (comments, likes).
                    To Communicate with You: We use email addresses for account verification, password resets, and sending system notifications (e.g., new followers, content moderation actions). We also use it to respond to contact form submissions.
                    To Process Transactions: We use user and pledge information to facilitate payments and creator payouts via your third-party payment processor.
                    To Improve the Service: We track content views and opportunity clicks to provide analytics for creators and to understand which features are popular.
                    To Enforce Rules & Security: We use reported content, user data, and login history to investigate rule violations, issue suspensions (suspended Until), and enforce permanent bans (banned).
                </p>

                <p className="heading small">3. Who We Share Your Data With</p>
                <p className="paragraph">
                    Publicly: A significant amount of data is public by design. This includes user profiles, all user-generated content (campaigns, opportunities, comments), and follower/following counts.
                    Third-Party Services: Our application is fundamentally dependent on sharing data with:
                    Google Cloud / Firebase: They are your backend provider and host all your data, including user accounts, database records, and stored files.
                    Payment Processor MMG: This service receives user payment information to process transactions.
                    We use Google Analytics to measure web traffic and user behavior, business KPIs and internal app data.
                </p>

                <p className="heading small">4. User Rights & Data Control</p>
                <p className="paragraph">
                    Access & Correction: The Creator Dashboard and My Content Library components allow users to view and update their profile information and manage their uploaded content.
                    Data Deletion: There is a dedicated user-facing "Delete Account" feature located at the bottom of all user dashboards. When this feature is used and a user confirms they want to delete their account, it triggers a comprehensive, multi-step process designed to permanently wipe almost all of their data from the application. It is irreversible. The feature is designed to be a "scorched-earth" removal of a user's presence and contributions from the platform, while carefully preserving the integrity of conversations they participated in.
                </p>

                <p className="heading small">5. Children's Privacy</p>
                <p className="paragraph">
                    Our service is not intended for children under the age of 16. We do not knowingly collect personally identifiable information from children under 16.
                </p>

            </div>
        </div>
    );
};

export default PrivacyPolicyScreen;