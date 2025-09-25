import React, { useState, useEffect } from 'react';
import { db, appId } from '../firebase'; // Import the correct appId
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import formatCurrency from '../utils/formatCurrency'; // Import the REAL formatting function

// --- Main AllCampaignsScreen Component ---

const AllCampaignsScreen = ({ showMessage, setActiveScreen, setSelectedCampaignId, currencyRates, selectedCurrency, currentUser }) => {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const PLATFORM_FEE_PERCENTAGE = 0.07; // This can be a constant

    useEffect(() => {
        // This listener will now run for ALL users, logged in or not.
        const campaignsCollectionRef = collection(db, `artifacts/${appId}/public/data/campaigns`);
        const q = query(campaignsCollectionRef, where('status', '==', 'active'), orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setCampaigns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching campaigns:", error);
            // Show a generic error for guests, as they can't do much about it.
            showMessage("Failed to load campaigns.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [showMessage]); // Dependency array no longer needs currentUser

    const filteredCampaigns = campaigns.filter(campaign => 
        campaign.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        campaign.creatorName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // This loading state is now correct for both logged-in and logged-out users.
    if (loading) {
        return (
            <div className="screenContainer" style={{ textAlign: 'center', paddingTop: '50px' }}>
                <p className="heading">Loading Campaigns...</p>
            </div>
        );
    }

    return (
        <div className="screenContainer">
            <p className="heading">All Campaigns</p>
            <p className="subHeading">Discover and support projects by Caribbean creators!</p>
            <div className="formGroup" style={{ marginTop: '10px', marginBottom: '20px' }}>
                <input
                    type="text"
                    className="formInput"
                    placeholder="Search by title or creator name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {campaigns.length === 0 && !loading ? (
                <p className="paragraph" style={{ textAlign: 'center', marginTop: '20px' }}>No active campaigns found yet.</p>
            ) : filteredCampaigns.length === 0 && campaigns.length > 0 ? (
                <p className="paragraph" style={{ textAlign: 'center', marginTop: '20px' }}>No campaigns found matching "{searchTerm}".</p>
            ) : (
                <div className="allCampaignsList">
                    {filteredCampaigns.map(campaign => (
                        <div
                            key={campaign.id}
                            className="allCampaignsListItem"
                            onClick={() => {
                                // This logic correctly gates the action for guests.
                                if (!currentUser) {
                                    showMessage("Please log in or sign up to view campaign details.");
                                    setActiveScreen('Login');
                                    return;
                                }
                                setSelectedCampaignId(campaign.id);
                                setActiveScreen('CampaignDetails');
                            }}
                        >
                            <div
                                className="campaignListImagePlaceholder"
                                style={{ backgroundImage: campaign.imageUrl ? `url(${campaign.imageUrl})` : 'none' }}
                            >
                                <button
                                    className="campaignListProjectButton"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (campaign.projectLink) {
                                            window.open(campaign.projectLink, '_blank');
                                        } else {
                                            showMessage('No project link provided for this campaign.');
                                        }
                                    }}
                                >
                                    View Project
                                </button>
                            </div>
                            <div className="campaignListContent">
                                <p className="campaignListTitle">{campaign.title}</p>
                                <div className="campaignListCreator">
                                    <img
                                        src={campaign.creatorProfilePictureUrl || 'https://placehold.co/24x24/555/FFF?text=P'}
                                        alt={campaign.creatorName}
                                        className="campaignListCreatorProfilePic"
                                    />
                                    <span>by {campaign.creatorName}</span>
                                </div>
                                <p className="campaignListDescription">{campaign.description}</p>
                                <div className="campaignProgressContainer" style={{ height: '8px', marginBottom: '5px' }}>
                                    <div
                                        className="campaignProgressBar"
                                        style={{ width: `${(campaign.raised / campaign.goal) * 100}%` }}
                                    ></div>
                                </div>
                                <div className="campaignListStats">
                                    <span>
                                        Raised: <span className="campaignListRaised">{formatCurrency(campaign.raised, selectedCurrency, currencyRates)}</span>
                                        <div className="fee-info-container">
                                            <span className="fee-info-icon">i</span>
                                            <div className="fee-info-tooltip">
                                                Creator receives {((1 - PLATFORM_FEE_PERCENTAGE) * 100).toFixed(0)}% of this total after platform fees.
                                            </div>
                                        </div>
                                    </span>
                                    <span>Goal: <span className="campaignListGoal">{formatCurrency(campaign.goal, selectedCurrency, currencyRates)}</span></span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <button
                className="button"
                onClick={() => setActiveScreen('SupportUsScreen')} // Assuming this is the correct screen to go back to
                style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}
            >
                <span className="buttonText light">Back to Support Us</span>
            </button>
        </div>
    );
};

export default AllCampaignsScreen;