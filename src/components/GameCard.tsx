import React from 'react';
import type { Game } from '../types';
import ParticipantAvatar from './ParticipantAvatar';

interface GameCardProps {
  game: Game;
  onJoin: (gameId: string) => void;
  onViewDetails: (gameId: string) => void;
}

const GameCard: React.FC<GameCardProps> = ({ game, onJoin, onViewDetails }) => {
  const getSkillLevelColor = (level: string) => {
    switch (level) {
      case 'Beginner': return 'success';
      case 'Intermediate': return 'warning';
      case 'Advanced': return 'danger';
      case 'Mixed': return 'info';
      default: return 'secondary';
    }
  };

  const getAgeGroupColor = (age: string) => {
    switch (age) {
      case 'Youth': return 'primary';
      case 'Adult': return 'success';
      case 'Senior': return 'info';
      case 'Mixed': return 'secondary';
      default: return 'secondary';
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const canJoin = game.isOpenToJoin && game.currentPlayers < game.maxPlayers;

  return (
    <div className="card h-100 shadow-sm border-0">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start mb-3">
          <div>
            <h6 className="card-title mb-1">{game.fieldName}</h6>
            <p className="text-muted small mb-0">
              <i className="bi bi-geo-alt me-1"></i>
              {game.fieldLocation}
            </p>
          </div>
          <div className="text-end">
            <div className="badge bg-success mb-1">${game.price}</div>
            <div className="small text-muted">{formatTime(game.time)}</div>
          </div>
        </div>

        <p className="card-text small mb-3">{game.description}</p>

        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="d-flex gap-1">
            <span className={`badge bg-${getSkillLevelColor(game.skillLevel)}`}>
              {game.skillLevel}
            </span>
            <span className={`badge bg-${getAgeGroupColor(game.ageGroup)}`}>
              {game.ageGroup}
            </span>
          </div>
          <div className="text-muted small">
            {game.currentPlayers}/{game.maxPlayers} players
          </div>
        </div>

        {/* Participants */}
        <div className="mb-3">
          <div className="d-flex align-items-center gap-2">
            <div className="d-flex align-items-center" style={{ marginRight: '8px' }}>
              {game.participants.slice(0, 5).map((participant, index) => (
                <div
                  key={participant.id}
                  style={{
                    marginLeft: index > 0 ? '-8px' : '0',
                    zIndex: 5 - index
                  }}
                >
                  <ParticipantAvatar participant={participant} size="sm" />
                </div>
              ))}
              {game.participants.length > 5 && (
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center text-white small"
                  style={{
                    width: '32px',
                    height: '32px',
                    backgroundColor: '#6c757d',
                    marginLeft: '-8px',
                    zIndex: 0
                  }}
                >
                  +{game.participants.length - 5}
                </div>
              )}
            </div>
            <small className="text-muted">
              Organized by {game.organizer}
            </small>
          </div>
        </div>

        <div className="d-flex gap-2">
          {canJoin ? (
            <button
              className="btn btn-primary btn-sm flex-fill"
              onClick={() => onJoin(game.id)}
            >
              <i className="bi bi-person-plus me-1"></i>
              Join Game
            </button>
          ) : (
            <button className="btn btn-secondary btn-sm flex-fill" disabled>
              <i className="bi bi-x-circle me-1"></i>
              Full
            </button>
          )}
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={() => onViewDetails(game.id)}
          >
            <i className="bi bi-info-circle"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameCard; 