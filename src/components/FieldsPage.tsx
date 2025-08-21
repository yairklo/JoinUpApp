import React, { useState } from 'react';
import Header from './Header';
import FieldCard from './FieldCard';
import FieldDetails from './FieldDetails';
import GameScheduler from './GameScheduler';
import Toast from './Toast';
import type { Field, Game, FieldType } from '../types';

const FieldsPage: React.FC = () => {
  const [fields, setFields] = useState<Field[]>([
    {
      id: '1',
      name: 'Central Park Football Field',
      location: 'New York, NY',
      price: 80,
      rating: 4.5,
      image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
      available: true,
      type: 'closed',
      games: [
        {
          id: 'game1',
          fieldId: '1',
          fieldName: 'Central Park Football Field',
          fieldLocation: 'New York, NY',
          fieldType: 'closed',
          date: new Date().toISOString().split('T')[0],
          time: '18:00',
          duration: 2,
          maxPlayers: 10,
          currentPlayers: 8,
          skillLevel: 'Intermediate',
          ageGroup: 'Adult',
          isOpenToJoin: true,
          description: 'Casual game, all welcome!',
          organizer: 'John Doe',
          price: 15,
          participants: []
        }
      ]
    },
    {
      id: '2',
      name: 'Riverside Sports Complex',
      location: 'Los Angeles, CA',
      price: 120,
      rating: 4.8,
      image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
      available: true,
      type: 'closed',
      games: []
    },
    {
      id: '3',
      name: 'Downtown Arena',
      location: 'Chicago, IL',
      price: 95,
      rating: 4.2,
      image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
      available: false,
      type: 'closed',
      games: []
    },
    {
      id: '4',
      name: 'Community Sports Center',
      location: 'Miami, FL',
      price: 65,
      rating: 4.6,
      image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
      available: true,
      type: 'closed',
      games: []
    },
    {
      id: '5',
      name: 'Public Park Field',
      location: 'New York, NY',
      price: 0,
      rating: 4.3,
      image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
      available: true,
      type: 'open',
      games: [
        {
          id: 'game2',
          fieldId: '5',
          fieldName: 'Public Park Field',
          fieldLocation: 'New York, NY',
          fieldType: 'open',
          date: new Date().toISOString().split('T')[0],
          time: '17:00',
          duration: 2,
          maxPlayers: 12,
          currentPlayers: 6,
          skillLevel: 'Mixed',
          ageGroup: 'Mixed',
          isOpenToJoin: true,
          description: 'Free pickup game!',
          organizer: 'Mike Johnson',
          price: 0,
          participants: []
        }
      ]
    },
    {
      id: '6',
      name: 'Beach Soccer Area',
      location: 'Miami Beach, FL',
      price: 0,
      rating: 4.7,
      image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
      available: true,
      type: 'open',
      games: []
    }
  ]);

  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [showFieldDetails, setShowFieldDetails] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [schedulerFieldId, setSchedulerFieldId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'open' | 'closed'>('open');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    isVisible: boolean;
  }>({
    message: '',
    type: 'info',
    isVisible: false
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setToast({ message, type, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  const handleFieldClick = (fieldId: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (field) {
      setSelectedField(field);
      setShowFieldDetails(true);
    }
  };

  const handleJoinGame = (gameId: string) => {
    console.log('Joining game:', gameId);
    showToast('Successfully joined the game!', 'success');
  };

  const handleCreateGame = (fieldId: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (field && field.type === 'closed') {
      setSchedulerFieldId(fieldId);
      setShowScheduler(true);
      setShowFieldDetails(false);
    } else if (field && field.type === 'open') {
      showToast('Open fields cannot be booked. Just show up and play!', 'info');
    }
  };

  const handleScheduleGame = (gameData: Partial<Game>) => {
    console.log('Creating new game:', gameData);
    
    const field = fields.find(f => f.id === gameData.fieldId);
    if (!field) return;

    // Create a new game with a unique ID
    const newGame: Game = {
      id: `game${Date.now()}`,
      fieldId: gameData.fieldId!,
      fieldName: field.name,
      fieldLocation: field.location,
      fieldType: field.type,
      date: gameData.date!,
      time: gameData.time!,
      duration: gameData.duration!,
      maxPlayers: gameData.maxPlayers!,
      currentPlayers: 1,
      skillLevel: gameData.skillLevel!,
      ageGroup: gameData.ageGroup!,
      isOpenToJoin: gameData.isOpenToJoin!,
      description: gameData.description!,
      organizer: 'You',
      price: gameData.price!,
      participants: []
    };

    // Add the new game to the field
    setFields(prevFields => 
      prevFields.map(f => 
        f.id === gameData.fieldId 
          ? { ...f, games: [...f.games, newGame] }
          : f
      )
    );

    showToast('Game created successfully!', 'success');
    setShowScheduler(false);
    setSchedulerFieldId('');
  };

  const getFieldName = (fieldId: string) => {
    const field = fields.find(f => f.id === fieldId);
    return field?.name || '';
  };

  const openFields = fields.filter(field => field.type === 'open');
  const closedFields = fields.filter(field => field.type === 'closed');

  return (
    <div className="min-vh-100 bg-light">
      <Header />
      
      <div className="container py-4">
        {/* Hero Section */}
        <div className="row mb-4">
          <div className="col-12 text-center">
            <h1 className="display-5 fw-bold mb-2">
              Football Fields
            </h1>
            <p className="lead text-muted">
              Find open fields for free play or book closed fields
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="row mb-4">
          <div className="col-12">
            <ul className="nav nav-tabs" id="fieldTabs" role="tablist">
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'open' ? 'active' : ''}`}
                  onClick={() => setActiveTab('open')}
                >
                  <i className="bi bi-unlock me-2"></i>
                  Open Fields ({openFields.length})
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'closed' ? 'active' : ''}`}
                  onClick={() => setActiveTab('closed')}
                >
                  <i className="bi bi-lock me-2"></i>
                  Closed Fields ({closedFields.length})
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Fields Grid */}
        <div className="row g-4">
          {(activeTab === 'open' ? openFields : closedFields).map(field => (
            <div key={field.id} className="col-lg-4 col-md-6">
              <div 
                className="card h-100 shadow-sm cursor-pointer"
                style={{ cursor: 'pointer' }}
                onClick={() => handleFieldClick(field.id)}
              >
                <div className="position-relative">
                  <img 
                    src={field.image} 
                    className="card-img-top" 
                    alt={field.name}
                    style={{ height: '200px', objectFit: 'cover' }}
                  />
                  <div className="position-absolute top-0 start-0 m-2">
                    {field.type === 'open' ? (
                      <span className="badge bg-success">
                        <i className="bi bi-unlock me-1"></i>
                        Free
                      </span>
                    ) : (
                      <span className="badge bg-primary">
                        <i className="bi bi-lock me-1"></i>
                        Bookable
                      </span>
                    )}
                  </div>
                </div>
                <div className="card-body d-flex flex-column">
                  <h5 className="card-title">{field.name}</h5>
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
                  <div className="mt-auto">
                    <div className="d-flex justify-content-between align-items-center">
                      <small className="text-muted">
                        {field.games.length} games today
                      </small>
                      {field.type === 'closed' ? (
                        <button 
                          className="btn btn-outline-primary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateGame(field.id);
                          }}
                        >
                          <i className="bi bi-calendar-plus me-1"></i>
                          Book Field
                        </button>
                      ) : (
                        <button 
                          className="btn btn-outline-success btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateGame(field.id);
                          }}
                        >
                          <i className="bi bi-people me-1"></i>
                          Organize Game
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Field Details Modal */}
        {showFieldDetails && selectedField && (
          <FieldDetails
            field={selectedField}
            onClose={() => {
              setShowFieldDetails(false);
              setSelectedField(null);
            }}
            onJoinGame={handleJoinGame}
            onCreateGame={handleCreateGame}
          />
        )}

        {/* Game Scheduler Modal */}
        {showScheduler && schedulerFieldId && schedulerFieldId !== '' && (
          <>
            <div 
              className="modal-backdrop fade show" 
              style={{ zIndex: 1040 }}
              onClick={() => {
                setShowScheduler(false);
                setSchedulerFieldId('');
              }}
            ></div>
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1050 }}>
              <GameScheduler
                fieldId={schedulerFieldId}
                fieldName={getFieldName(schedulerFieldId)}
                fieldType={fields.find(f => f.id === schedulerFieldId)?.type}
                onSchedule={handleScheduleGame}
                onClose={() => {
                  setShowScheduler(false);
                  setSchedulerFieldId('');
                }}
              />
            </div>
          </>
        )}

        {/* Toast Notifications */}
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={hideToast}
        />
      </div>
    </div>
  );
};

export default FieldsPage; 