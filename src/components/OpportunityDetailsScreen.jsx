import React, { useState, useEffect, useRef } from 'react'; // <-- Import useRef
import FlyerModal from './FlyerModal';
import { functions, httpsCallable } from '../firebase';

const OpportunityDetailsScreen = ({ showMessage, setActiveScreen, selectedOpportunity }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const viewCountedRef = useRef(false); // <-- Create the ref flag

    // --- THIS IS THE DEFINITIVE FIX FOR A SINGLE VIEW COUNT ---
    useEffect(() => {
        // This effect only runs its logic if the component has the opportunity data AND the view has not been counted yet.
        if (selectedOpportunity && selectedOpportunity.id && !viewCountedRef.current) {
            // Immediately set the flag to true. This prevents this logic from ever running again for this instance of the component.
            viewCountedRef.current = true;
            
            const incrementView = async () => {
                try {
                    const incrementViewFunction = httpsCallable(functions, 'incrementOpportunityView');
                    await incrementViewFunction({ opportunityId: selectedOpportunity.id });
                } catch (error) {
                    console.error("Error incrementing opportunity view count:", error);
                }
            };
            incrementView();
        }
    }, [selectedOpportunity]); // The effect listens for the opportunity prop to be available.
    // --- END OF FIX ---

    if (!selectedOpportunity) {
        React.useEffect(() => setActiveScreen('CreatorConnect'), []);
        return null;
    }

    return (
        <>
            <div className="screenContainer">
                {selectedOpportunity.flyerImageUrl && (
                    <img 
                        src={selectedOpportunity.flyerImageUrl} 
                        alt="Opportunity Flyer" 
                        className="opportunity-flyer-image"
                        onClick={() => setIsModalOpen(true)}
                    />
                )}
                <p className="heading">{selectedOpportunity.title}</p>
                <p className="subHeading">Posted by {selectedOpportunity.providerName}</p>
                
                <div className="dashboardSection">
                    <div className="campaignListStats" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '10px'}}>
                        <p><strong>Type:</strong> <span className="campaignListGoal">{selectedOpportunity.opportunityType}</span></p>
                        <p><strong>Location:</strong> <span className="campaignListGoal">{selectedOpportunity.location}</span></p>
                        <p><strong>Compensation:</strong> <span className="campaignListGoal">{selectedOpportunity.compensationType}</span></p>
                        <p><strong>Equipment:</strong> <span className="campaignListGoal">{selectedOpportunity.equipmentProvided}</span></p>
                        <p><strong>Apply By:</strong> <span className="campaignListGoal">{new Date(selectedOpportunity.expiresAt.toDate()).toLocaleDateString()}</span></p>
                    </div>
                </div>

                <div className="dashboardSection">
                    <p className="dashboardSectionTitle">Description</p>
                    <p className="paragraph" style={{whiteSpace: 'pre-wrap'}}>{selectedOpportunity.description}</p>
                </div>

                {/* THE FIX: Add a dedicated, clickable link if the URL exists */}
                {selectedOpportunity.mainUrl && (
                     <div className="dashboardSection" style={{ border: '1px solid #00FFFF', marginTop: '20px' }}>
                        <p className="dashboardSectionTitle" style={{color: '#00FFFF'}}>Project Link</p>
                        <a href={selectedOpportunity.mainUrl} target="_blank" rel="noopener noreferrer" className="termsLink">
                            Click here for more details
                        </a>
                    </div>
                )}

                <div className="dashboardSection" style={{border: '1px solid #FFD700'}}>
                    <p className="dashboardSectionTitle">How to Apply</p>
                    <p className="paragraph" style={{whiteSpace: 'pre-wrap'}}>{selectedOpportunity.howToApply}</p>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '20px' }}>
                    <button className="button" onClick={() => window.dispatchEvent(new CustomEvent('openCommentsModal', { detail: { item: selectedOpportunity, itemType: 'opportunity' } }))} style={{margin: 0}}>
                        <span className="buttonText">View Comments</span>
                    </button>
                    <button className="button" onClick={() => setActiveScreen('CreatorConnect')} style={{backgroundColor: '#3A3A3A', margin: 0}}>
                        <span className="buttonText light">Back to All Opportunities</span>
                    </button>
                </div>
            </div>

            {isModalOpen && (
                <FlyerModal 
                    imageUrl={selectedOpportunity.flyerImageUrl} 
                    onClose={() => setIsModalOpen(false)} 
                />
            )}
        </>
    );
};

export default OpportunityDetailsScreen;