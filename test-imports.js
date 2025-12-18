// Test file to verify all imports are working correctly

console.log('Testing imports...');

try {
  // Test server imports
  console.log('1. Testing server imports...');
  const { gameSocketHandlers, gameHttpRoutes } = require('./routes/Game');
  console.log('✅ Game imports successful');

  // Test services imports
  console.log('2. Testing services imports...');
  const { ValidationService, NotificationService, UtilityService, RoomService } = require('./routes/Services');
  console.log('✅ Services imports successful');

  // Test functions imports
  console.log('3. Testing functions imports...');
  const { UNOGame, GameManager } = require('./routes/Services/functions');
  console.log('✅ Functions imports successful');

  // Test creating instances
  console.log('4. Testing instance creation...');
  const gameManager = new GameManager();
  const roomService = new RoomService();
  console.log('✅ Instance creation successful');

  console.log('🎉 All imports are working correctly!');
} catch (error) {
  console.error('❌ Import error:', error.message);
  process.exit(1);
}
