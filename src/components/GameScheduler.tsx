import React, { useState } from 'react';
import type { Game } from '../types';

interface GameSchedulerProps {
  fieldId: string;
  fieldName: string;
  fieldType?: 'open' | 'closed';
  onSchedule: (gameData: Partial<Game>) => void;
  onClose: () => void;
}

const GameScheduler: React.FC<GameSchedulerProps> = ({ 
  fieldId, 
  fieldName, 
  fieldType = 'closed',
  onSchedule, 
  onClose 
}) => {
  const [gameData, setGameData] = useState<Partial<Game>>({
    fieldId,
    fieldType,
    date: new Date().toISOString().split('T')[0],
    time: '18:00',
    duration: 1,
    maxPlayers: 10,
    currentPlayers: 1,
    skillLevel: 'Mixed',
    ageGroup: 'Mixed',
    isOpenToJoin: true,
    description: '',
    organizer: 'You',
    price: fieldType === 'open' ? 0 : 15
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSchedule(gameData);
  };

  const handleChange = (field: keyof Game, value: string | number | boolean) => {
    setGameData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="modal fade show" style={{ display: 'block', zIndex: 1050 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-plus-circle me-2"></i>
              {fieldType === 'open' ? 'Organize Free Game' : 'Book Field'}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
            ></button>
          </div>
          <div className="modal-body">
            <p className="text-muted mb-3">
              Field: <strong>{fieldName}</strong>
              {fieldType === 'open' && (
                <span className="badge bg-success ms-2">Free Field</span>
              )}
              {fieldType === 'closed' && (
                <span className="badge bg-primary ms-2">Bookable Field</span>
              )}
            </p>
            
            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label htmlFor="date" className="form-label">Date</label>
                  <input
                    type="date"
                    className="form-control"
                    id="date"
                    required
                    value={gameData.date}
                    onChange={(e) => handleChange('date', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label htmlFor="time" className="form-label">Time</label>
                  <input
                    type="time"
                    className="form-control"
                    id="time"
                    required
                    value={gameData.time}
                    onChange={(e) => handleChange('time', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label htmlFor="duration" className="form-label">Duration</label>
                  <select
                    className="form-select"
                    id="duration"
                    value={gameData.duration}
                    onChange={(e) => handleChange('duration', parseInt(e.target.value))}
                  >
                    <option value={1}>1 hour</option>
                    <option value={2}>2 hours</option>
                    <option value={3}>3 hours</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label htmlFor="maxPlayers" className="form-label">Players</label>
                  <select
                    className="form-select"
                    id="maxPlayers"
                    value={gameData.maxPlayers}
                    onChange={(e) => handleChange('maxPlayers', parseInt(e.target.value))}
                  >
                    <option value={6}>6 players (3v3)</option>
                    <option value={10}>10 players (5v5)</option>
                    <option value={12}>12 players (6v6)</option>
                    <option value={22}>22 players (11v11)</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label htmlFor="skillLevel" className="form-label">Skill Level</label>
                  <select
                    className="form-select"
                    id="skillLevel"
                    value={gameData.skillLevel}
                    onChange={(e) => handleChange('skillLevel', e.target.value)}
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label htmlFor="ageGroup" className="form-label">Age Group</label>
                  <select
                    className="form-select"
                    id="ageGroup"
                    value={gameData.ageGroup}
                    onChange={(e) => handleChange('ageGroup', e.target.value)}
                  >
                    <option value="Youth">Youth (Under 18)</option>
                    <option value="Adult">Adult (18-40)</option>
                    <option value="Senior">Senior (40+)</option>
                    <option value="Mixed">Mixed Ages</option>
                  </select>
                </div>
                <div className="col-12">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="isOpenToJoin"
                      checked={gameData.isOpenToJoin}
                      onChange={(e) => handleChange('isOpenToJoin', e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="isOpenToJoin">
                      Open to join for other players
                    </label>
                  </div>
                </div>
                <div className="col-12">
                  <label htmlFor="description" className="form-label">Description</label>
                  <textarea
                    className="form-control"
                    id="description"
                    rows={2}
                    placeholder={fieldType === 'open' ? "Describe your free game..." : "Describe your booked game..."}
                    value={gameData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                  />
                </div>
                {fieldType === 'closed' && (
                  <div className="col-md-6">
                    <label htmlFor="price" className="form-label">Price per Player</label>
                    <div className="input-group">
                      <span className="input-group-text">$</span>
                      <input
                        type="number"
                        className="form-control"
                        id="price"
                        placeholder="0"
                        value={gameData.price}
                        onChange={(e) => handleChange('price', parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button 
              type="button" 
              className={`btn ${fieldType === 'open' ? 'btn-success' : 'btn-primary'}`}
              onClick={handleSubmit}
            >
              <i className={`bi ${fieldType === 'open' ? 'bi-people' : 'bi-calendar-check'} me-2`}></i>
              {fieldType === 'open' ? 'Organize Game' : 'Book Field'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameScheduler; 