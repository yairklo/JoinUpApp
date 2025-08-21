import React, { useState } from 'react';
import Header from './Header';
import FieldSearch from './FieldSearch';
import FieldCard from './FieldCard';
import FieldDetails from './FieldDetails';
import GameScheduler from './GameScheduler';
import Toast from './Toast';
import type { Field, Game, SearchFilters } from '../types';

const HomePage: React.FC = () => {
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
          date: '2024-01-15',
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
        },
        {
          id: 'game2',
          fieldId: '1',
          fieldName: 'Central Park Football Field',
          fieldLocation: 'New York, NY',
          fieldType: 'closed',
          date: '2024-01-15',
          time: '20:00',
          duration: 1,
          maxPlayers: 6,
          currentPlayers: 6,
          skillLevel: 'Advanced',
          ageGroup: 'Adult',
          isOpenToJoin: false,
          description: 'Competitive match',
          organizer: 'Mike Smith',
          price: 20,
          participants: []
        },
        {
          id: 'game5',
          fieldId: '1',
          fieldName: 'Central Park Football Field',
          fieldLocation: 'New York, NY',
          fieldType: 'closed',
          date: new Date().toISOString().split('T')[0],
          time: '19:00',
          duration: 2,
          maxPlayers: 12,
          currentPlayers: 9,
          skillLevel: 'Mixed',
          ageGroup: 'Mixed',
          isOpenToJoin: true,
          description: 'Fun evening game!',
          organizer: 'Alex Johnson',
          price: 12,
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
      games: [
        {
          id: 'game3',
          fieldId: '2',
          fieldName: 'Riverside Sports Complex',
          fieldLocation: 'Los Angeles, CA',
          fieldType: 'closed',
          date: '2024-01-15',
          time: '19:00',
          duration: 2,
          maxPlayers: 12,
          currentPlayers: 10,
          skillLevel: 'Mixed',
          ageGroup: 'Mixed',
          isOpenToJoin: true,
          description: 'Fun game for everyone',
          organizer: 'Sarah Wilson',
          price: 12,
          participants: []
        }
      ]
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
      games: [
        {
          id: 'game4',
          fieldId: '4',
          fieldName: 'Community Sports Center',
          fieldLocation: 'Miami, FL',
          fieldType: 'closed',
          date: '2024-01-15',
          time: '17:00',
          duration: 1,
          maxPlayers: 8,
          currentPlayers: 6,
          skillLevel: 'Beginner',
          ageGroup: 'Youth',
          isOpenToJoin: true,
          description: 'Youth training session',
          organizer: 'Coach Johnson',
          price: 8,
          participants: []
        }
      ]
    }
  ]);

  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [showFieldDetails, setShowFieldDetails] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [schedulerFieldId, setSchedulerFieldId] = useState<string>('');
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

  const handleSearch = (filters: SearchFilters) => {
    console.log('Search filters:', filters);
    showToast('Search completed!', 'info');
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
    
    // Find the game and update the player count
    setFields(prevFields => 
      prevFields.map(field => ({
        ...field,
        games: field.games.map(game => 
          game.id === gameId 
            ? { ...game, currentPlayers: Math.min(game.currentPlayers + 1, game.maxPlayers) }
            : game
        )
      }))
    );

    showToast('Successfully joined the game!', 'success');
  };

  const handleCreateGame = (fieldId: string) => {
    console.log('Creating game for field:', fieldId);
    
    // Temporary solution - show toast if modal doesn't work
    const fieldName = getFieldName(fieldId);
    showToast(`Creating new game at ${fieldName}...`, 'info');
    
    setSchedulerFieldId(fieldId);
    setShowScheduler(true);
    setShowFieldDetails(false);
  };

  const handleScheduleGame = (gameData: Partial<Game>) => {
    console.log('Creating new game:', gameData);
    
    // Create a new game with a unique ID
    const newGame: Game = {
      id: `game${Date.now()}`,
      fieldId: gameData.fieldId!,
      fieldName: 'Your Field', // This would come from the form
      fieldLocation: 'Your Location',
      fieldType: (gameData.fieldType as any) || 'closed',
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
      prevFields.map(field => 
        field.id === gameData.fieldId 
          ? { ...field, games: [...field.games, newGame] }
          : field
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

  return (
    <div className="min-vh-100 bg-light">
      <Header />
      
      <div className="container py-4">
        {/* Hero Section */}
        <div className="row mb-5">
          <div className="col-lg-8 mx-auto text-center">
            <h1 className="display-4 fw-bold mb-3">
              Find and Join Football Games
            </h1>
            <p className="lead text-muted mb-4">
              Discover football fields, join existing games, or create your own matches.
            </p>
            <div className="d-flex justify-content-center gap-3">
              <button className="btn btn-primary btn-lg">Find Fields</button>
              <button className="btn btn-outline-primary btn-lg">Learn More</button>
            </div>
          </div>
        </div>

        {/* Search Section */}
        <div className="row mb-5">
          <div className="col-lg-8 mx-auto">
            <FieldSearch onSearch={handleSearch} />
          </div>
        </div>

        {/* Fields Grid */}
        <div className="row mb-5">
          <div className="col-12">
            <h2 className="mb-4">Available Fields</h2>
          </div>
          {fields.map(field => (
            <div key={field.id} className="col-lg-3 col-md-6 mb-4">
              <div 
                className="card h-100 shadow-sm cursor-pointer"
                style={{ cursor: 'pointer' }}
                onClick={() => handleFieldClick(field.id)}
              >
                <img 
                  src={field.image} 
                  className="card-img-top" 
                  alt={field.name}
                  style={{ height: '200px', objectFit: 'cover' }}
                />
                <div className="card-body d-flex flex-column">
                  <h5 className="card-title">{field.name}</h5>
                  <p className="card-text text-muted">
                    <i className="bi bi-geo-alt"></i> {field.location}
                  </p>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <span className="badge bg-success">${field.price}/hour</span>
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
                      <button 
                        className="btn btn-outline-primary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateGame(field.id);
                        }}
                      >
                        <i className="bi bi-plus me-1"></i>
                        Create Game
                      </button>
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

export default HomePage; 