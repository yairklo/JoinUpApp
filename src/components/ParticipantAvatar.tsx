import React from 'react';

interface Participant {
  id: string;
  name: string;
  avatar?: string;
}

interface ParticipantAvatarProps {
  participant: Participant;
  size?: 'sm' | 'md' | 'lg';
}

const ParticipantAvatar: React.FC<ParticipantAvatarProps> = ({ participant, size = 'md' }) => {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getSizeClass = () => {
    switch (size) {
      case 'sm': return '32px';
      case 'lg': return '48px';
      default: return '40px';
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm': return '12px';
      case 'lg': return '18px';
      default: return '14px';
    }
  };

  return (
    <div
      className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
      style={{
        width: getSizeClass(),
        height: getSizeClass(),
        fontSize: getFontSize(),
        backgroundColor: participant.avatar ? 'transparent' : '#6c757d',
        backgroundImage: participant.avatar ? `url(${participant.avatar})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        border: '2px solid #fff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}
      title={participant.name}
    >
      {!participant.avatar && getInitials(participant.name)}
    </div>
  );
};

export default ParticipantAvatar; 