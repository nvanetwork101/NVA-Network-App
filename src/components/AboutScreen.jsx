import React from 'react';

const AboutScreen = ({ setActiveScreen }) => {
  const sectionStyle = {
    marginBottom: '30px',
    padding: '20px',
    backgroundColor: '#1A1A1A',
    borderRadius: '8px',
    border: '1px solid #2A2A2A',
  };

  const subHeadingStyle = {
    fontSize: '20px',
    color: '#FFD700', // Using your theme's primary accent color
    borderBottom: '2px solid #FFD700',
    paddingBottom: '10px',
    marginBottom: '15px',
  };

  return (
    <div className="screenContainer">
      <h1 className="heading" style={{ textAlign: 'center', fontSize: '32px' }}>About NVA Network</h1>
      <p style={{ textAlign: 'center', fontSize: '18px', color: '#CCC', marginTop: '-10px', marginBottom: '40px' }}>
        Empowering Caribbean Creators. Entertaining the World.
      </p>

      <div style={sectionStyle}>
        <p className="dashboardItem">
          NVA Network is the Caribbean’s first mobile-first entertainment platform, born from a passion for the unique, vibrant, and hilarious stories our region has to offer.
        </p>
        <p className="dashboardItem">
          For too long, the incredible work of Caribbean comedians, filmmakers, artists, and storytellers has been scattered across the internet, making it hard for fans to find and for creators to build a sustainable career. We’ve built a dedicated home where this talent is celebrated, supported, and showcased to a global audience.
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={subHeadingStyle}>What We Offer</h2>
        <p className="dashboardItem" style={{ fontStyle: 'italic', color: '#DDD' }}>
          Our platform is a complete ecosystem designed for both fans and creators.
        </p>
        
        <h3 style={{ fontSize: '18px', color: '#E0E0E0', marginTop: '25px' }}>For Our Fans:</h3>
        <ul style={{ listStyleType: 'disc', paddingLeft: '20px', color: '#AAA' }}>
          <li style={{ marginBottom: '10px' }}><strong>Discover Exclusive Content:</strong> Explore a curated library of skits, short films, interviews, and more that you won’t find anywhere else.</li>
          <li style={{ marginBottom: '10px' }}><strong>Follow Your Favorites:</strong> Build a personalized "My Feed" timeline with the latest releases from the creators you follow.</li>
          <li style={{ marginBottom: '10px' }}><strong>Directly Support Projects:</strong> Be the reason a new film or series gets made through our creator crowdfunding campaigns.</li>
          <li style={{ marginBottom: '10px' }}><strong>Engage and Compete:</strong> Participate in community-wide competitions, vote for your favorite entries, and win amazing prizes.</li>
        </ul>

        <h3 style={{ fontSize: '18px', color: '#E0E0E0', marginTop: '25px' }}>For Our Creators:</h3>
        <ul style={{ listStyleType: 'disc', paddingLeft: '20px', color: '#AAA' }}>
          <li style={{ marginBottom: '10px' }}><strong>A Dedicated Platform:</strong> Showcase your work in a professional environment, free from the noise of mainstream video sites.</li>
          <li style={{ marginBottom: '10px' }}><strong>Build Your Audience:</strong> Connect directly with a passionate fanbase through our follower and notification systems.</li>
          <li style={{ marginBottom: '10px' }}><strong>Fund Your Vision:</strong> Launch crowdfunding campaigns to get the direct financial support you need to bring your creative ideas to life.</li>
          <li style={{ marginBottom: '10px' }}><strong>Connect and Collaborate:</strong> Use our Creator Connect hub to find casting calls, crew, and brand partnership opportunities. This is an exclusive feature for our Advertisers and Premium Subscribers.</li>
        </ul>
      </div>

      <div style={sectionStyle}>
        <h2 style={subHeadingStyle}>The NVA Difference</h2>
        <p className="dashboardItem">
          We are a community-driven ecosystem. A view, a like, or a dollar spent on the NVA Network has a direct and meaningful impact, helping to build a stronger and more vibrant creative industry in the Caribbean.
        </p>
        <p className="dashboardItem">
          Whether you’re here to discover your next favorite skit, fund a groundbreaking short film, or share your own creative voice, you are a vital part of our network.
        </p>
        <p className="dashboardItem" style={{ fontWeight: 'bold', color: '#FFD700', marginTop: '20px' }}>
          Welcome to the family. Welcome to the NVA Network.
        </p>
      </div>
    </div>
  );
};

export default AboutScreen;