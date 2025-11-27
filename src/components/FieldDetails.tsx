import React, { useState } from 'react';
import type { Field } from '../types';

interface FieldDetailsProps {
  field: Field;
  onClose: () => void;
  onJoinGame: (gameId: string) => void;
  onCreateGame: (fieldId: string) => void;
}

const FieldDetails: React.FC<FieldDetailsProps> = ({
  field,
  onClose,
  onJoinGame,
  onCreateGame
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const getTimeSlots = () => {
    const slots = [];
    for (let hour = 6; hour <= 22; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    return slots;
  };

  const getGameAtTime = (time: string, date: string) => {
    return field.games.find(game => game.time === time && game.date === date);
  };

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

  return (
    <div className="modal fade show" style={{ display: 'block' }}>
      <div className="modal-dialog modal-xl">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-geo-alt me-2"></i>
              {field.name}
              {field.type === 'open' && (
                <span className="badge bg-success ms-2">
                  <i className="bi bi-unlock me-1"></i>
                  Free Field
                </span>
              )}
              {field.type === 'closed' && (
                <span className="badge bg-primary ms-2">
                  <i className="bi bi-lock me-1"></i>
                  Bookable Field
                </span>
              )}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
            ></button>
          </div>
          <div className="modal-body">
            <div className="row">
              {/* Field Info */}
              <div className="col-md-4">
                <div className="card">
                  <img 
                    src={field.image} 
                    className="card-img-top" 
                    alt={field.name}
                    style={{ height: '200px', objectFit: 'cover' }}
                  />
                  <div className="card-body">
                    <h6 className="card-title">{field.name}</h6>
                    <p className="card-text text-muted">
                      <i className="bi bi-geo-alt"></i> {field.location}
                    </p>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      {field.type === 'open' ? (
                        <span className="badge bg-success">Free</span>
                      ) : (
                        <span className="badge bg-success">${field.price}/hour</span>
                      )}
                      <div className="d-flex align-items-center">
                        <i className="bi bi-star-fill text-warning me-1"></i>
                        <span>{field.rating}/5</span>
                      </div>
                    </div>
                    {field.type === 'closed' ? (
                      <button 
                        className="btn btn-primary w-100"
                        onClick={() => onCreateGame(field.id)}
                      >
                        <i className="bi bi-calendar-plus me-2"></i>
                        Book This Field
                      </button>
                    ) : (
                      <button 
                        className="btn btn-success w-100"
                        onClick={() => onCreateGame(field.id)}
                      >
                        <i className="bi bi-people me-2"></i>
                        Organize Free Game
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Schedule */}
              <div className="col-md-8">
                <div className="card">
                  <div className="card-header">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">
                        {field.type === 'open' ? 'Free Games' : 'Booked Slots'}
                      </h6>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        style={{ width: 'auto' }}
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="card-body p-0">
                    <div className="table-responsive">
                      <table className="table table-sm mb-0">
                        <thead className="table-light">
                          <tr>
                            <th style={{ width: '80px' }}>Time</th>
                            <th>Game Details</th>
                            <th style={{ width: '100px' }}>Players</th>
                            <th style={{ width: '100px' }}>Level</th>
                            <th style={{ width: '100px' }}>Age</th>
                            <th style={{ width: '120px' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getTimeSlots().map(time => {
                            const game = getGameAtTime(time, selectedDate);
                            return (
                              <tr key={time} className={game ? 'table-warning' : ''}>
                                <td className="fw-bold">{time}</td>
                                <td>
                                  {game ? (
                                    <div>
                                      <small className="text-muted">{game.description}</small>
                                      <br />
                                      <small className="text-muted">By: {game.organizer}</small>
                                    </div>
                                  ) : (
                                    <span className="text-muted">
                                      {field.type === 'open' ? 'Available for free play' : 'Available for booking'}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {game ? (
                                    <span>
                                      {game.currentPlayers}/{game.maxPlayers}
                                      {game.isOpenToJoin && game.currentPlayers < game.maxPlayers && (
                                        <i className="bi bi-person-plus text-success ms-1"></i>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                                <td>
                                  {game ? (
                                    <span className={`badge bg-${getSkillLevelColor(game.skillLevel)}`}>
                                      {game.skillLevel}
                                    </span>
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                                <td>
                                  {game ? (
                                    <span className={`badge bg-${getAgeGroupColor(game.ageGroup)}`}>
                                      {game.ageGroup}
                                    </span>
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                                <td>
                                  {game ? (
                                    game.isOpenToJoin && game.currentPlayers < game.maxPlayers ? (
                                      <button
                                        className="btn btn-sm btn-outline-success"
                                        onClick={() => onJoinGame(game.id)}
                                      >
                                        <i className="bi bi-person-plus me-1"></i>
                                        Join
                                      </button>
                                    ) : (
                                      <span className="text-muted">Full</span>
                                    )
                                  ) : (
                                    <button
                                      className="btn btn-sm btn-outline-primary"
                                      onClick={() => onCreateGame(field.id)}
                                    >
                                      <i className="bi bi-plus me-1"></i>
                                      {field.type === 'open' ? 'Organize' : 'Book'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </div>
  );
};

export default FieldDetails; 