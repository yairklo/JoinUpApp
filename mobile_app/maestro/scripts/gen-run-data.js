// Maestro GraalJS script (runScript). Generates collision-free test data for one flow run.
// Clerk *development* instances treat any "+clerk_test" email as a test address: no mail is sent
// and the verification code is always 424242. Production Clerk instances do NOT support this.
var runId = String(new Date().getTime()) + String(Math.floor(Math.random() * 1000));

output.runId = runId;
output.emailA = 'e2e-a-' + runId + '+clerk_test@example.com';
output.emailB = 'e2e-b-' + runId + '+clerk_test@example.com';
output.password = 'Jn-E2e-7qLx!42vz-' + runId.slice(-4);
output.gameTitle = 'E2E Game ' + runId;
output.chatMessage = 'hello e2e ' + runId;
// The form's default time is "today, next hour", which is already past between 23:00 and midnight.
// Always book tomorrow at 12:00 so the slot is in the future on both the device and the API.
var slot = new Date();
slot.setDate(slot.getDate() + 1);
output.slotDay = String(slot.getDate());
output.slotRollMonth = slot.getDate() === 1 ? '1' : '0';
