import React, { useState } from 'react';
import Header from './Header';
import GameCard from './GameCard';
import GameScheduler from './GameScheduler';
import Toast from './Toast';
import type { Game, Participant } from '../types';

const ActiveGamesPage: React.FC = () => {
  const [games, setGames] = useState<Game[]>([
    {
      id: 'game1',
      fieldId: '1',
      fieldName: 'Central Park Football Field',
      fieldLocation: 'New York, NY',
      date: new Date().toISOString().split('T')[0],
      time: '18:00',
      duration: 2,
      maxPlayers: 10,
      currentPlayers: 8,
      skillLevel: 'Intermediate',
      ageGroup: 'Adult',
      isOpenToJoin: true,
      description: 'Casual game, all welcome! Perfect for intermediate players.',
      organizer: 'John Doe',
      price: 15,
      participants: [
        { id: 'p1', name: 'John Doe' },
        { id: 'p2', name: 'Mike Smith' },
        { id: 'p3', name: 'Sarah Wilson' },
        { id: 'p4', name: 'Alex Johnson' },
        { id: 'p5', name: 'David Brown' },
        { id: 'p6', name: 'Emma Davis' },
        { id: 'p7', name: 'Tom Wilson' },
        { id: 'p8', name: 'Lisa Garcia' }
      ]
    },
    {
      id: 'game2',
      fieldId: '2',
      fieldName: 'Riverside Sports Complex',
      fieldLocation: 'Los Angeles, CA',
      date: new Date().toISOString().split('T')[0],
      time: '19:00',
      duration: 2,
      maxPlayers: 12,
      currentPlayers: 10,
      skillLevel: 'Mixed',
      ageGroup: 'Mixed',
      isOpenToJoin: true,
      description: 'Fun evening game for all skill levels!',
      organizer: 'Sarah Wilson',
      price: 12,
      participants: [
        { id: 'p9', name: 'Sarah Wilson' },
        { id: 'p10', name: 'Chris Lee' },
        { id: 'p11', name: 'Maria Rodriguez' },
        { id: 'p12', name: 'James Taylor' },
        { id: 'p13', name: 'Anna Martinez' },
        { id: 'p14', name: 'Robert Anderson' },
        { id: 'p15', name: 'Jennifer Thomas' },
        { id: 'p16', name: 'Michael Jackson' },
        { id: 'p17', name: 'Linda White' },
        { id: 'p18', name: 'Daniel Clark' }
      ]
    },
    {
      id: 'game3',
      fieldId: '4',
      fieldName: 'Community Sports Center',
      fieldLocation: 'Miami, FL',
      date: new Date().toISOString().split('T')[0],
      time: '17:00',
      duration: 1,
      maxPlayers: 8,
      currentPlayers: 6,
      skillLevel: 'Beginner',
      ageGroup: 'Youth',
      isOpenToJoin: true,
      description: 'Youth training session - perfect for beginners!',
      organizer: 'Coach Johnson',
      price: 8,
      participants: [
        { id: 'p19', name: 'Coach Johnson' },
        { id: 'p20', name: 'Timmy Smith' },
        { id: 'p21', name: 'Bobby Wilson' },
        { id: 'p22', name: 'Jenny Davis' },
        { id: 'p23', name: 'Sammy Brown' },
        { id: 'p24', name: 'Lily Garcia' }
      ]
    },
    {
      id: 'game4',
      fieldId: '1',
      fieldName: 'Central Park Football Field',
      fieldLocation: 'New York, NY',
      date: new Date().toISOString().split('T')[0],
      time: '20:00',
      duration: 1,
      maxPlayers: 6,
      currentPlayers: 6,
      skillLevel: 'Advanced',
      ageGroup: 'Adult',
      isOpenToJoin: false,
      description: 'Competitive match - advanced players only',
      organizer: 'Mike Smith',
      price: 20,
      participants: [
        { id: 'p25', name: 'Mike Smith' },
        { id: 'p26', name: 'Carlos Rodriguez' },
        { id: 'p27', name: 'Ahmed Hassan' },
        { id: 'p28', name: 'Yuki Tanaka' },
        { id: 'p29', name: 'Marcus Johnson' },
        { id: 'p30', name: 'Sophie Chen' }
      ]
    }
  ]);

  const [showScheduler, setShowScheduler] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
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

  const handleJoinGame = (gameId: string) => {
    const game = games.find(g => g.id === gameId);
    if (game && game.isOpenToJoin && game.currentPlayers < game.maxPlayers) {
      // Add a new participant (in real app, this would be the current user)
      const newParticipant: Participant = {
        id: `p${Date.now()}`,
        name: 'You'
      };

      setGames(prevGames => 
        prevGames.map(g => 
          g.id === gameId 
            ? {
                ...g,
                currentPlayers: g.currentPlayers + 1,
                participants: [...g.participants, newParticipant]
              }
            : g
        )
      );

      showToast(`Successfully joined the game at ${game.fieldName}!`, 'success');
    } else {
      showToast('This game is full or not open for joining.', 'warning');
    }
  };

  const handleViewDetails = (gameId: string) => {
    const game = games.find(g => g.id === gameId);
    if (game) {
      setSelectedGame(game);
      showToast(`Game Details: ${game.description}`, 'info');
    }
  };

  const handleCreateGame = () => {
    setShowScheduler(true);
  };

  const handleScheduleGame = (gameData: Partial<Game>) => {
    console.log('Creating new game:', gameData);
    
    // Create a new game with a unique ID
    const newGame: Game = {
      id: `game${Date.now()}`,
      fieldId: gameData.fieldId!,
      fieldName: 'Your Field', // This would come from the form
      fieldLocation: 'Your Location',
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
      participants: [{ id: 'p1', name: 'You' }]
    };

    setGames(prevGames => [newGame, ...prevGames]);
    showToast('Game created successfully!', 'success');
    setShowScheduler(false);
  };

  const todayGames = games.filter(game => game.date === new Date().toISOString().split('T')[0]);

  return (
    <div className="min-vh-100 bg-light">
      <Header />
      
      <div className="container py-4">
        {/* Hero Section */}
        <div className="row mb-4">
          <div className="col-12 text-center">
            <h1 className="display-5 fw-bold mb-2">
              Today's Active Games
            </h1>
            <p className="lead text-muted">
              Join existing games or create your own
            </p>
          </div>
        </div>

        {/* Games Grid */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4 className="mb-0">Available Games ({todayGames.length})</h4>
              <button 
                className="btn btn-primary"
                onClick={handleCreateGame}
              >
                <i className="bi bi-plus-circle me-2"></i>
                Create New Game
              </button>
            </div>
          </div>
        </div>

        {todayGames.length === 0 ? (
          <div className="row">
            <div className="col-12 text-center py-5">
              <i className="bi bi-calendar-x display-1 text-muted mb-3"></i>
              <h4 className="text-muted">No games today</h4>
              <p className="text-muted">Be the first to create a game!</p>
              <button 
                className="btn btn-primary btn-lg"
                onClick={handleCreateGame}
              >
                <i className="bi bi-plus-circle me-2"></i>
                Create First Game
              </button>
            </div>
          </div>
        ) : (
          <div className="row g-4">
            {todayGames.map(game => (
              <div key={game.id} className="col-lg-4 col-md-6">
                <GameCard
                  game={game}
                  onJoin={handleJoinGame}
                  onViewDetails={handleViewDetails}
                />
              </div>
            ))}
          </div>
        )}

        {/* Floating Action Button */}
        <div 
          className="position-fixed"
          style={{ bottom: '2rem', right: '2rem', zIndex: 1000 }}
        >
          <button 
            className="btn btn-primary btn-lg rounded-circle shadow-lg"
            style={{ width: '60px', height: '60px' }}
            onClick={handleCreateGame}
            title="Create New Game"
          >
            <i className="bi bi-plus fs-4"></i>
          </button>
        </div>

        {/* Game Scheduler Modal */}
        {showScheduler && (
          <>
            <div 
              className="modal-backdrop fade show" 
              style={{ zIndex: 1040 }}
              onClick={() => setShowScheduler(false)}
            ></div>
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1050 }}>
              <GameScheduler
                fieldId="new"
                fieldName="New Game"
                onSchedule={handleScheduleGame}
                onClose={() => setShowScheduler(false)}
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

export default ActiveGamesPage; 