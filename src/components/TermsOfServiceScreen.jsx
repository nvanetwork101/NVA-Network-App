// src/components/TermsOfServiceScreen.jsx
import React from 'react';

const TermsOfServiceScreen = ({ setActiveScreen }) => {
    return (
        <div className="screenContainer" style={{ textAlign: 'left', paddingBottom: '80px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <button onClick={() => window.history.back()} className="backButton">
                    &#x2190; Back
                </button>
                <p className="heading" style={{ margin: 0, flexGrow: 1, textAlign: 'center' }}>Terms of Service</p>
                <div style={{ width: '70px' }}></div> {/* Spacer */}
            </div>

            <div className="dashboardSection" style={{ padding: '20px', lineHeight: 1.6 }}>
                <p className="paragraph" style={{ fontStyle: 'italic', color: '#AAA' }}>Last updated: [Enter Your Date Here]</p>

                <p className="heading small">1. User-Generated Content (UGC)</p>
                <p className="paragraph">
                    <strong>Ownership:</strong> Users retain ownership of their uploaded content.
                </p>
                <p className="paragraph">
                    <strong>Content Responsibility and Reporting Policy:</strong> You are solely responsible for all content, including videos, images, text, and campaign materials ("Your Content"), that you upload, post, or otherwise transmit via the NVA Network service. By uploading Your Content, you affirm, represent, and warrant that: (a) you are the creator and owner of Your Content, or (b) you have obtained all necessary licenses, rights, consents, and permissions to use and to authorize NVA Network to display Your Content as described in these Terms. NVA Network does not claim ownership of Your Content. However, by submitting content, you grant NVA Network a worldwide, non-exclusive, royalty-free license to host, display, and distribute Your Content on the platform.
                </p>
                <p className="paragraph">
                    <strong>Reporting Infringement or Violations:</strong> NVA Network is a platform that respects the rights of creators. If you believe that any content on the service infringes upon your rights of ownership, please provide our designated agent with a formal notice containing the following: 1. Your full legal name and contact information (email and phone number). 2. A clear and detailed description of your original work that you claim is being infringed. Please provide evidence of your ownership, such as a link to where it was first published. 3. The specific URL on NVA Network where the allegedly infringing content is located. 4. A statement, made in good faith, that you believe the use of the material is not authorized by you, the rightful owner. Upon receipt of a valid and complete notice, NVA Network will launch an internal investigation. Our actions may include temporarily disabling the content pending review. If, in our sole discretion, we determine that a violation has likely occurred based on the evidence provided, we will permanently remove the content from our service.
                </p>
                <p className="paragraph">
                    <strong>Limitation of Liability and Disclaimer:</strong> NVA Network is a neutral service provider and hosting platform. We do not and cannot make legal determinations of ownership or adjudicate copyright disputes. Our reporting and takedown procedure is provided as a courtesy to help protect the integrity of the platform. By using this service, you agree that NVA Network is not a publisher of user-generated content and is not liable for any content posted by its users. Any legal grievance, claim for damages, or dispute regarding content ownership is a matter to be resolved directly between the user who uploaded the content and the party filing the complaint. NVA Network's only obligation under this policy is to investigate good-faith reports and remove content that, in our assessment, violates our terms. We are not liable for any damages, financial or otherwise, arising from content uploaded by users.
                </p>
                <p className="paragraph">
                    <strong>Repeat Infringer Policy:</strong> It is the policy of NVA Network to terminate, in appropriate circumstances, the accounts of users who are determined to be repeat infringers of copyright.
                </p>
                <p className="paragraph">
                    <strong>Prohibited Content:</strong> Prohibited content includes hate speech, illegal activities, nudity, harassment, and copyright infringement. If reported or it comes under the radar of an admin or authority, content will be removed. Depending on the severity of the violation, the user is subject to suspension or a permanent ban.
                </p>

                <p className="heading small">2. User Conduct</p>
                <p className="paragraph">
                    Our service is suitable for users 18 years and over, or 16 and over with parental consent and/or supervision. One account is allowed per person. Users are responsible for their own password security via Firebase Auth. Prohibited actions include harassing other users, hacking, data scraping, spamming, and using the service for illegal purposes.
                </p>

                <p className="heading small">3. Moderation and Enforcement</p>
                <p className="paragraph">
                    The codebase gives 'admin' and 'authority' roles extensive capabilities, including reviewing reports, managing content, and issuing suspensions/bans. We reserve the right to moderate the platform and enforce these terms at our discretion.
                </p>

                <p className="heading small">4. Financial Terms</p>
                <p className="paragraph">
                    <strong>Payments:</strong> Users are bound by all Mobile Money Guyana (MMG) terms and conditions.
                    <strong>Platform Fees:</strong> We charge a 7% platform fee on funds raised through campaigns. This does not apply to other transaction types.
                    <strong>Payouts:</strong> There is no minimum payout amount or refund policy. The financial condition required to request a payout is: The Campaign Goal Must Be Met or the campaign duration must reach maturity. When a creator requests a payout, a message is sent to an administrator with a status of "pending". It is reviewed and the user is contacted. They are required to send a copy of their ID card via WhatsApp and present a Mobile Money Guyana account number with their legal name to verify identity for payout approval. An administrator must then go to the Admin Dashboard to review this request and manually process the payout. There is no automated schedule.
                </p>

                <p className="heading small">5. Intellectual Property</p>
                <p className="paragraph">
                    The app's name ("NVA Network"), logo, and all original code are our property. The reporting feature can be used for copyright infringement, but you need a formal policy and a designated agent to comply with the DMCA (Digital Millennium Copyright Act).
                </p>

                <p className="heading small">6. Disclaimers and Liability</p>
                <p className="paragraph">
                    <strong>Disclaimer of Warranties:</strong> The NVA Network service is provided on an "AS IS" and "AS AVAILABLE" basis, without any warranties of any kind, either express or implied. To the fullest extent permissible by law, NVA Network disclaims all warranties, including, but not limited to, the implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
                </p>
                <p className="paragraph">
                    <strong>Limitation of Liability:</strong> To the maximum extent permitted by applicable law, in no event shall NVA Network, its affiliates, directors, employees, or agents be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your access to or use of the service; any conduct or content of any third party; any content obtained from the service; or unauthorized access, use, or alteration of your content. In no event shall the aggregate liability of NVA Network exceed the greater of one hundred U.S. dollars ($100.00) or the amount you have paid NVA Network, if any, in the past six months for the services giving rise to the claim.
                </p>

                <p className="heading small">7. General Business Information</p>
                <p className="paragraph">
                    Name: Ninja Visual Arts<br/>
                    Address: 122 East Ruimveldt H/S, Region 4: Georgetown Guyana<br/>
                    Contact: 592-672-3204 or 592-710-3204<br/>
                    Email: nvaceo101@gmail.com
                </p>

            </div>
        </div>
    );
};

export default TermsOfServiceScreen;