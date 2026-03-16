const fs = require('fs');
const path = require('path');

const target = 'e:\\New folder (2)\\Get-Notified\\functions';

try {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log('Successfully deleted functions');
  } else {
    console.log('functions folder does not exist');
  }
} catch (err) {
  console.error('Error deleting functions:', err.message);
}
