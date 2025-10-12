import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, addDoc, collection, updateDoc } from 'firebase/firestore';

// --- START: NEW REACT-ICONS IMPLEMENTATION ---
// Import the specific, high-quality icons we need from the library
import { 
    FaDiscord, 
    FaFacebook, 
    FaInstagram, 
    FaLinkedin, 
    FaTelegramPlane, 
    FaTiktok, 
    FaWhatsapp, 
    FaYoutube,
    FaQuestionCircle // A default icon for any unrecognized links
} from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6'; // The new, official "X" logo
import { BsThreads } from 'react-icons/bs';   // A high-quality icon for Threads

const SocialIcon = ({ url, name }) => {
    const lowerName = name ? name.toLowerCase() : '';
    let IconComponent;

    // This "smarter" lookup logic finds the right icon even if the name isn't an exact match
    if (lowerName.includes('discord')) IconComponent = FaDiscord;
    else if (lowerName.includes('facebook')) IconComponent = FaFacebook;
    else if (lowerName.includes('instagram')) IconComponent = FaInstagram;
    else if (lowerName.includes('linkedin')) IconComponent = FaLinkedin;
    else if (lowerName.includes('telegram')) IconComponent = FaTelegramPlane;
    else if (lowerName.includes('threads')) IconComponent = BsThreads;
    else if (lowerName.includes('tiktok')) IconComponent = FaTiktok;
    else if (lowerName.includes('whatsapp')) IconComponent = FaWhatsapp;
    else if (lowerName.includes('twitter')) IconComponent = FaXTwitter; // This correctly handles "X / Twitter"
    else if (lowerName.includes('youtube')) IconComponent = FaYoutube;
    else IconComponent = FaQuestionCircle; // Fallback for safety

    return (
        <a 
            href={url} 
            target="_blank" 
            rel="noopener noreferrer" 
            title={name} 
            style={{ 
                color: '#FFD700', 
                transition: 'transform 0.2s',
                fontSize: '36px' // Controls the size of the icons
            }}
            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.15)'}
            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
        >
            <IconComponent />
        </a>
    );
};
// --- END: NEW REACT-ICONS IMPLEMENTATION ---

const ContactScreen = ({ setActiveScreen, showMessage, currentUser }) => {
    const [socialLinks, setSocialLinks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [queryType, setQueryType] = useState('General Question');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (currentUser) {
            const userDocRef = doc(db, "creators", currentUser.uid);
            getDoc(userDocRef).then(docSnap => {
                if (docSnap.exists()) {
                    setUserName(docSnap.data().creatorName || currentUser.email.split('@')[0]);
                }
            });
            setUserEmail(currentUser.email);
        }

        const socialLinksDocRef = doc(db, "settings", "socialLinks");
        getDoc(socialLinksDocRef).then(docSnap => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data && Array.isArray(data.links)) {
                    setSocialLinks(data.links.filter(link => link.isEnabled === true));
                }
            }
            setIsLoading(false);
        });
    }, [currentUser]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!userName || !userEmail || !message) {
            showMessage("Please fill in all required fields.");
            return;
        }
        if (!currentUser) {
            showMessage("You must be logged in to send a message.");
            setActiveScreen('Login');
            return;
        }
        
        setIsSubmitting(true);

        try {
            const userDocRef = doc(db, "creators", currentUser.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                if (userData.lastSubmissionTimestamp) {
                    const lastSubmitTime = userData.lastSubmissionTimestamp.toDate();
                    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    if (lastSubmitTime > twentyFourHoursAgo) {
                        showMessage("You can only send one message every 24 hours.");
                        setIsSubmitting(false);
                        return;
                    }
                }
            }

            await addDoc(collection(db, "contactSubmissions"), {
                userName, userEmail, queryType, message,
                submittedAt: new Date().toISOString(),
                status: 'New',
                userId: currentUser.uid
            });

            await updateDoc(userDocRef, { lastSubmissionTimestamp: new Date() });

            showMessage("Your message has been sent successfully!");
            setMessage('');
            setQueryType('General Question');
        } catch (error) {
            showMessage(`An error occurred: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="screenContainer">
            <p className="heading">Get In Touch</p>
            <p className="subHeading">Connect with us on social media or send us a message below.</p>

            <div className="dashboardSection">
                <p className="dashboardSectionTitle" style={{ textAlign: 'center' }}>Follow Us</p>
                {isLoading ? ( <p style={{ textAlign: 'center' }}>Loading social links...</p> ) : (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '25px', flexWrap: 'wrap', marginTop: '20px' }}>
                        {socialLinks.map(link => (
                            <SocialIcon key={link.name} url={link.url} name={link.name} />
                        ))}
                    </div>
                )}
            </div>

            <div className="dashboardSection" style={{ marginTop: '20px' }}>
                <p className="dashboardSectionTitle">Send a Message</p>
                <form onSubmit={handleSubmit}>
                    <div className="formGroup"><label htmlFor="contactName" className="formLabel">Your Name:</label><input type="text" id="contactName" className="formInput" value={userName} onChange={(e) => setUserName(e.target.value)} required /></div>
                    <div className="formGroup"><label htmlFor="contactEmail" className="formLabel">Your Email:</label><input type="email" id="contactEmail" className="formInput" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} required /></div>
                    <div className="formGroup"><label htmlFor="contactQueryType" className="formLabel">Reason for Contact:</label><select id="contactQueryType" className="formInput" value={queryType} onChange={(e) => setQueryType(e.target.value)}><option>General Question</option><option>Bug Report</option><option>Partnership Inquiry</option><option>Feedback & Suggestions</option></select></div>
                    <div className="formGroup"><label htmlFor="contactMessage" className="formLabel">Message:</label><textarea id="contactMessage" className="formTextarea" value={message} onChange={(e) => setMessage(e.target.value)} required></textarea></div>
                    <button type="submit" className="button" disabled={isSubmitting}><span className="buttonText">{isSubmitting ? 'Sending...' : 'Send Message'}</span></button>
                </form>
            </div>
        </div>
    );
};

export default ContactScreen;