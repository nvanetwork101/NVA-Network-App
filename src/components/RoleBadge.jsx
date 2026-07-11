import React from 'react';

const RoleBadge = ({ profile }) => {
    if (!profile) return null;

    const badgesToShow = [];

    // --- PRIORITY 1: ADMIN & STAFF BADGES ---
    if (profile.role === 'admin') {
        badgesToShow.push({ key: 'admin', text: 'ADMIN', icon: '⍟', styles: { backgroundColor: '#0A0A0A', color: '#FFFFFF', border: '1px solid #FFD700' }, iconColor: '#FFD700' });
    } else if (profile.role === 'authority') {
        badgesToShow.push({ key: 'authority', text: 'AUTHORITY', icon: '✪', styles: { backgroundColor: '#FFFFFF', color: '#0A0A0A', border: '1px solid #AAAAAA' }, iconColor: '#0A0A0A' });
    }

    // --- PRIORITY 1.5: SPECIAL STATUS (GOLD CLUB) ---
    if (Array.isArray(profile.badges) && profile.badges.includes('Gold Club')) {
        badgesToShow.push({ 
            key: 'goldclub', 
            text: 'GOLD CLUB', 
            icon: '👑', 
            styles: { 
                backgroundColor: '#D4AF37', // Metallic Gold
                color: '#000000', 
                border: '1px solid #AA8A2E',
                boxShadow: '0 0 10px rgba(212, 175, 55, 0.5)'
            }, 
            iconColor: '#000000' 
        });
    }

    // --- PRIORITY 2: ENROLLMENT & STATUS STACKS ---
    const hasContestantBadge = profile.isContestant || 
                               profile.isContestantMember || 
                               (Array.isArray(profile.badges) && (
                                   profile.badges.includes('Contestant') || 
                                   profile.badges.includes('contestant') || 
                                   profile.badges.includes('Docu-Series') ||
                                   profile.badges.includes('Docu-series')
                               ));

    if (hasContestantBadge) {
        badgesToShow.push({ key: 'contestant', text: 'CONTESTANT', icon: '🎬', styles: { backgroundColor: '#00FFFF', color: '#0A0A0A', border: 'none' }, iconColor: '#0A0A0A' });
    }
    
    const hasFilmClubBadge = profile.isFilmClub || 
                             profile.isFilmClubMember || 
                             profile.isFilmStudent || 
                             profile.isClassMember || 
                             (Array.isArray(profile.badges) && (
                                 profile.badges.includes('Film Club') || 
                                 profile.badges.includes('filmclub') || 
                                 profile.badges.includes('Film Student') ||
                                 profile.badges.includes('Film Club Student') ||
                                 profile.badges.includes('Class Member')
                             ));

    if (hasFilmClubBadge) {
        badgesToShow.push({ key: 'filmclub', text: 'FILM CLUB', icon: '🍿', styles: { backgroundColor: '#4169E1', color: '#FFFFFF', border: 'none' }, iconColor: '#FFFFFF' });
    }

    // --- PRIORITY 3: CREATOR FIELD (ONLY 1 ALLOWED) ---
    if (profile.creatorField) {
        const fieldColors = {
            'Comedian': { bg: '#FF4500', color: '#FFF' },
            'Craft': { bg: '#D2691E', color: '#FFF' },
            'Health & Fitness': { bg: '#20B2AA', color: '#FFF' },
            'Designer': { bg: '#FF1493', color: '#FFF' },
            'Influencer': { bg: '#00BFFF', color: '#0A0A0A' },
            'Poet': { bg: '#9370DB', color: '#FFF' },
            'Musician': { bg: '#32CD32', color: '#0A0A0A' },
            'Filmmaker': { bg: '#FFD700', color: '#0A0A0A' },
            'Actor': { bg: '#DC143C', color: '#FFF' }
        };
        
        const style = fieldColors[profile.creatorField] || { bg: '#555', color: '#FFF' };
        
        badgesToShow.push({
            key: 'creatorField', text: profile.creatorField.toUpperCase(),
            styles: { backgroundColor: style.bg, color: style.color, border: 'none' }
        });
    }

    // --- PRIORITY 4: DEFAULT NORMAL USER ---
    // If they have no creator field, no staff role, and no special club badges, they are a standard User.
    if (!profile.creatorField && profile.role === 'user' && !profile.isContestant && !profile.isFilmClub) {
        badgesToShow.push({
            key: 'user', text: 'USER',
            styles: { backgroundColor: '#3A3A3A', color: '#FFFFFF', border: '1px solid #777' }
        });
    }

    if (badgesToShow.length === 0) return null;

    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '5px', marginLeft: '8px' }}>
            {badgesToShow.map(badge => (
                <span key={badge.key} style={{
                    ...badge.styles,
                    padding: '3px 8px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    verticalAlign: 'middle'
                }}>
                    {badge.text}
                    {badge.icon && <span style={{ color: badge.iconColor }}>{badge.icon}</span>}
                </span>
            ))}
        </div>
    );
};

export default RoleBadge;