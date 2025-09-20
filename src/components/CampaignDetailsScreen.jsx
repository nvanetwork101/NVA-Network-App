import React, { useState, useEffect } from 'react';
import { db, appId } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import formatCurrency from '../utils/formatCurrency'; // Import the REAL formatting function

const getDate = (dateValue) => {
    if (!dateValue) return new Date(); // Fallback to now if date is missing
    if (typeof dateValue.toDate === 'function') {
        return dateValue.toDate();
    }
    return new Date(dateValue);
};

// --- Main CampaignDetailsScreen Component ---

const CampaignDetailsScreen = ({ 
    showMessage, 
    setActiveScreen, 
    selectedCampaignId, 
    currentUser, 
    setPledgeContext, 
    selectedCurrency, 
    currencyRates,
    // New props from the parent component
    campaign: campaignProp,
    loading: loadingProp
}) => {
    const [campaign, setCampaign] = useState(campaignProp || null);
    const [loading, setLoading] = useState(loadingProp !== undefined ? loadingProp : true);

    useEffect(() => {
        // If data is passed via props (from admin view), do nothing.
        if (campaignProp !== undefined) {
            setCampaign(campaignProp);
            setLoading(loadingProp);
            return;
        }

        // Original logic for public view (when props are not provided)
        if (!selectedCampaignId) {
            showMessage("No campaign selected.");
            setActiveScreen('AllCampaigns');
            return;
        }

        const fetchCampaignDetails = async () => {
            setLoading(true);
            try {
                const campaignDocRef = doc(db, `artifacts/${appId}/public/data/campaigns`, selectedCampaignId);
                const docSnap = await getDoc(campaignDocRef);

                if (docSnap.exists()) {
                    setCampaign({ id: docSnap.id, ...docSnap.data() });
                } else {
                    showMessage("Campaign not found.");
                    setActiveScreen('AllCampaigns');
                }
            } catch (error) {
                console.error("Error fetching campaign details:", error);
                showMessage("Failed to load campaign details.");
                setActiveScreen('AllCampaigns');
            } finally {
                setLoading(false);
            }
        };

        fetchCampaignDetails();
    }, [selectedCampaignId, showMessage, setActiveScreen, campaignProp, loadingProp]);

    const handleSupportCampaign = () => {
    if (!campaign) return;

    const isEnded = getDate(campaign.endDate) < new Date(); // USE THE HELPER
    if (isEnded || campaign.status !== 'active') {
        showMessage("This campaign is not active and cannot receive donations.");
        return;
    }
    if (!currentUser) {
        showMessage("Please log in to support a campaign.");
        setActiveScreen('Login');
        return;
    }

    setPledgeContext({
        type: 'donation',
        campaignId: campaign.id,
        campaignTitle: campaign.title,
        creatorName: campaign.creatorName,
    });
    setActiveScreen('DonationPledge');
};

    if (loading) {
        return (
            <div className="screenContainer" style={{ textAlign: 'center', paddingTop: '50px' }}>
                <p className="heading">Loading Campaign Details...</p>
            </div>
        );
    }

    if (!campaign) {
        return null; // Render nothing if campaign is not found, as we've already navigated away.
    }

    const getDate = (dateValue) => {
    if (!dateValue) return new Date(); // Fallback to now if date is missing
    // Check if it's a Firestore Timestamp object with a toDate method
    if (typeof dateValue.toDate === 'function') {
        return dateValue.toDate();
    }
    // Otherwise, assume it's an ISO string and create a new Date from it
    return new Date(dateValue);
    };

    const progressPercentage = (campaign.raised / campaign.goal) * 100;
    const campaignEndDate = getDate(campaign.endDate); // Use the safe helper
    const isCampaignEnded = campaignEndDate < new Date();
    const daysRemaining = Math.ceil((campaignEndDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    const isCampaignActive = campaign.status === 'active' && !isCampaignEnded;

    return (
        <div className="screenContainer">
            <div className="campaignDetailHeader">
                {campaign.imageUrl && (
                    <img
                        src={campaign.imageUrl}
                        alt={campaign.title}
                        className="campaignDetailImage"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                )}
                <p className="campaignDetailTitle">
                    {campaign.title}
                    {isCampaignActive && <span style={{color: '#00FF00', fontSize: '16px', marginLeft: '10px'}}>(Active)</span>}
                    {isCampaignEnded && <span style={{color: '#DC3545', fontSize: '16px', marginLeft: '10px'}}>(Ended)</span>}
                </p>
                <div className="campaignDetailCreator">
                    <img
                        src={campaign.creatorProfilePictureUrl || 'https://placehold.co/32x32/555/FFF?text=P'}
                        alt={campaign.creatorName}
                        className="campaignDetailCreatorProfilePic"
                    />
                    <span>by {campaign.creatorName}</span>
                </div>
            </div>

            <p className="campaignDetailDescription">{campaign.description}</p>

            <div className="campaignDetailStats">
    <div className="campaignDetailStatItem"><p className="campaignDetailStatValue">{formatCurrency(campaign.raised, selectedCurrency, currencyRates)}</p><p>Raised</p></div>
    <div className="campaignDetailStatItem"><p className="campaignDetailStatValue">{formatCurrency(campaign.goal, selectedCurrency, currencyRates)}</p><p>Goal</p></div>
    <div className="campaignDetailStatItem"><p className="campaignDetailStatValue">{Math.round(progressPercentage)}%</p><p>Progress</p></div>
    </div>

            <div className="campaignDetailProgressBarContainer">
                <div className="campaignDetailProgressBar" style={{ width: `${progressPercentage}%` }}></div>
            </div>

            {!isCampaignEnded && (
                <p className="smallText" style={{ textAlign: 'center', color: '#00FF00', marginTop: '10px' }}>
                    {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Campaign ending soon!'}
                </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '20px' }}>
                <button
                    className="button"
                    onClick={handleSupportCampaign}
                    disabled={!isCampaignActive}
                    style={!isCampaignActive ? { backgroundColor: '#555', cursor: 'not-allowed', margin: 0 } : { margin: 0 }}
                >
                    <span className="buttonText">{isCampaignActive ? 'Support This Campaign' : 'Campaign Not Active'}</span>
                </button>

                {campaign.projectLink && (
                    <button className="button" onClick={() => window.open(campaign.projectLink, '_blank')} style={{ backgroundColor: '#3A3A3A', margin: 0 }}>
                        <span className="buttonText light">Visit Project Link</span>
                    </button>
                )}

                <button className="button" onClick={() => setActiveScreen('AllCampaigns')} style={{ backgroundColor: '#3A3A3A', margin: 0 }}>
                    <span className="buttonText light">Back to All Campaigns</span>
                </button>
            </div>
        </div>
    );
};

export default CampaignDetailsScreen;