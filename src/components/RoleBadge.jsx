import React from 'react';

// This component is the single source of truth for all user badges.
// It builds an array of all badges a user qualifies for and renders them.
const RoleBadge = ({ profile }) => {
    if (!profile) return null;

    const badgesToShow = [];

    // --- PRIORITY 1: ROLE BADGES ---
    if (profile.role === 'admin') {
        badgesToShow.push({
            key: 'admin', text: 'ADMIN', icon: '⍟',
            styles: { backgroundColor: '#0A0A0A', color: '#FFFFFF', border: '1px solid #FFD700' },
            iconColor: '#FFD700'
        });
    } else if (profile.role === 'authority') {
        badgesToShow.push({
            key: 'authority', text: 'AUTHORITY', icon: '✪',
            styles: { backgroundColor: '#FFFFFF', color: '#0A0A0A', border: '1px solid #AAAAAA' },
            iconColor: '#0A0A0A'
        });
    } else if (profile.role === 'creator') {
        badgesToShow.push({
            key: 'creator', text: 'CREATOR',
            styles: { backgroundColor: '#555555', color: '#FFFFFF', border: 'none' }
        });
    }

    // --- PRIORITY 2: STATUS BADGES (can stack with roles) ---
    if (profile.isVerifiedAdvertiser) {
        badgesToShow.push({
            key: 'verified', text: 'VERIFIED',
            styles: { backgroundColor: '#00FFFF', color: '#0A0A0A', border: 'none' }
        });
    }
    if (profile.premiumExpiresAt?.toDate() > new Date()) {
        badgesToShow.push({
            key: 'premium', text: 'PREMIUM', icon: '👑',
            styles: { backgroundColor: '#FFD700', color: '#0A0A0A', border: '1px solid #0A0A0A' },
            iconColor: '#0A0A0A'
        });
    }

    if (badgesToShow.length === 0) return null;

    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginLeft: '8px' }}>
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