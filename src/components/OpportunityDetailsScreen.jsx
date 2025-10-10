import React, { useState, useEffect, useRef } from 'react';
import { db, functions, httpsCallable } from '../firebase'; // Correctly import db
import { doc, getDoc } from "firebase/firestore"; // Import Firestore functions
import FlyerModal from './FlyerModal';
import ShareButton from './ShareButton';

const OpportunityDetailsScreen = ({ showMessage, setActiveScreen, selectedOpportunity }) => {
    // --- STATE MANAGEMENT ---
    const [opportunityDetails, setOpportunityDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const viewCountedRef = useRef(false);

    // --- DATA FETCHING EFFECT ---
    // This effect runs when the component loads to fetch the full opportunity details.
    useEffect(() => {
        // Guard against running if there's no opportunity prop.
        if (!selectedOpportunity || !selectedOpportunity.id) {
            setLoading(false);
            return;
        }

        const fetchOpportunity = async () => {
            try {
                const docRef = doc(db, "opportunities", selectedOpportunity.id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setOpportunityDetails({ id: docSnap.id, ...docSnap.data() });
                } else {
                    showMessage("This opportunity could not be found.");
                    setActiveScreen('CreatorConnect'); // Redirect if not found
                }
            } catch (error) {
                console.error("Error fetching opportunity details:", error);
                showMessage("An error occurred while loading the opportunity.");
            } finally {
                setLoading(false); // Stop loading regardless of outcome
            }
        };

        fetchOpportunity();
    }, [selectedOpportunity.id]); // Dependency on the ID ensures this runs once

    // --- VIEW COUNTER EFFECT ---
    // This effect now runs safely AFTER the full details have been fetched.
    useEffect(() => {
        if (opportunityDetails && !viewCountedRef.current) {
            viewCountedRef.current = true;
            
            const incrementView = async () => {
                try {
                    const incrementViewFunction = httpsCallable(functions, 'incrementOpportunityView');
                    await incrementViewFunction({ opportunityId: opportunityDetails.id });
                } catch (error) {
                    console.error("Error incrementing opportunity view count:", error);
                }
            };
            incrementView();
        }
    }, [opportunityDetails]); // This now depends on the fully-loaded state object

    // --- RENDER LOGIC ---

    // 1. Render a loading state while fetching data.
    if (loading) {
        return (
            <div className="screenContainer" style={{textAlign: 'center', paddingTop: '50px'}}>
                <p className="heading">Loading Opportunity...</p>
            </div>
        );
    }

    // 2. Render an error/redirect state if no details were found after loading.
    if (!opportunityDetails) {
        // This case is handled by the redirect in the fetch logic, but serves as a fallback.
        return (
             <div className="screenContainer" style={{textAlign: 'center', paddingTop: '50px'}}>
                <p className="heading">Opportunity Not Found</p>
                <button className="button" onClick={() => setActiveScreen('CreatorConnect')}>
                    <span className="buttonText">Back to Opportunities</span>
                </button>
            </div>
        );
    }

    // 3. Render the full component with the fetched 'opportunityDetails' object.
    return (
        <>
            <div className="screenContainer">
                {opportunityDetails.flyerImageUrl && (
                    <img 
                        src={opportunityDetails.flyerImageUrl} 
                        alt="Opportunity Flyer" 
                        className="opportunity-flyer-image"
                        onClick={() => setIsModalOpen(true)}
                    />
                )}
                <p className="heading">{opportunityDetails.title}</p>
                <p className="subHeading">Posted by {opportunityDetails.providerName}</p>
                
                <div className="dashboardSection">
                    <div className="campaignListStats" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '10px'}}>
                        <p><strong>Type:</strong> <span className="campaignListGoal">{opportunityDetails.opportunityType}</span></p>
                        <p><strong>Location:</strong> <span className="campaignListGoal">{opportunityDetails.location}</span></p>
                        <p><strong>Compensation:</strong> <span className="campaignListGoal">{opportunityDetails.compensationType}</span></p>
                        <p><strong>Equipment:</strong> <span className="campaignListGoal">{opportunityDetails.equipmentProvided}</span></p>
                        {/* This line is now safe because it only runs after opportunityDetails is loaded */}
                        {opportunityDetails.expiresAt && <p><strong>Apply By:</strong> <span className="campaignListGoal">{new Date(opportunityDetails.expiresAt.toDate()).toLocaleDateString()}</span></p>}
                    </div>
                </div>

                <div className="dashboardSection">
                    <p className="dashboardSectionTitle">Description</p>
                    <p className="paragraph" style={{whiteSpace: 'pre-wrap'}}>{opportunityDetails.description}</p>
                </div>

                {opportunityDetails.mainUrl && (
                     <div className="dashboardSection" style={{ border: '1px solid #00FFFF', marginTop: '20px' }}>
                        <p className="dashboardSectionTitle" style={{color: '#00FFFF'}}>Project Link</p>
                        <a href={opportunityDetails.mainUrl} target="_blank" rel="noopener noreferrer" className="termsLink">
                            Click here for more details
                        </a>
                    </div>
                )}

                <div className="dashboardSection" style={{border: '1px solid #FFD700'}}>
                    <p className="dashboardSectionTitle">How to Apply</p>
                    <p className="paragraph" style={{whiteSpace: 'pre-wrap'}}>{opportunityDetails.howToApply}</p>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '20px' }}>
                    <button className="button" onClick={() => window.dispatchEvent(new CustomEvent('openCommentsModal', { detail: { item: opportunityDetails, itemType: 'opportunity' } }))} style={{margin: 0}}>
                        <span className="buttonText">View Comments</span>
                    </button>
                    <ShareButton
                        title={opportunityDetails.title}
                        text={`Check out the opportunity "${opportunityDetails.title}" on NVA Network!`}
                        url={`/opportunity/${opportunityDetails.id}`}
                        showMessage={showMessage}
                    />
                    <button className="button" onClick={() => setActiveScreen('CreatorConnect')} style={{backgroundColor: '#3A3A3A', margin: 0}}>
                        <span className="buttonText light">Back to All Opportunities</span>
                    </button>
                </div>
            </div>

            {isModalOpen && (
                <FlyerModal 
                    imageUrl={opportunityDetails.flyerImageUrl} 
                    onClose={() => setIsModalOpen(false)} 
                />
            )}
        </>
    );
};

export default OpportunityDetailsScreen;