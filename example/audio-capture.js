// Example of audio capture (system and microphone)
import createScreenRecorder from 'screencapturekit';
import { screens, audioDevices, microphoneDevices } from 'screencapturekit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Recording duration in milliseconds
const RECORDING_DURATION = 15000; // 15 seconds

// Create a readline interface for user interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to ask a question and get an answer
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Function to choose a device from a list
async function chooseDevice(devices, type) {
  if (!devices || devices.length === 0) {
    return null;
  }

  console.log(`\nAvailable ${type} devices:`);
  devices.forEach((device, index) => {
    console.log(`   [${index}] ${device.name} (${device.manufacturer || 'Unknown manufacturer'}) (ID=${device.id})`);
  });

  const defaultChoice = 0;
  const input = await question(`Choose a ${type} device [0-${devices.length - 1}] (default: ${defaultChoice}): `);
  const choice = input === '' ? defaultChoice : parseInt(input, 10);

  if (isNaN(choice) || choice < 0 || choice >= devices.length) {
    console.log(`Invalid choice, using device ${defaultChoice}`);
    return devices[defaultChoice];
  }

  return devices[choice];
}

async function openYouTubeInBrowser(url) {
  console.log(`Opening ${url} in the default browser...`);
  try {
    await execAsync(`open "${url}"`);
    return true;
  } catch (error) {
    console.error(`Error opening browser: ${error.message}`);
    return false;
  }
}

// Function to generate a unique audio file name
function generateAudioFileName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(os.tmpdir(), `audio-capture-${timestamp}.m4a`);
}

async function main() {
  try {
    console.log('=== AUDIO CAPTURE CONFIGURATION ===');

    // Get available screens (required even for audio only)
    const availableScreens = await screens();
    if (!availableScreens || availableScreens.length === 0) {
      throw new Error('No screen available for recording, required even for audio');
    }

    // Use the first available screen
    const selectedScreen = availableScreens[0];
    console.log(`\nScreen used for capture (required for API): ${selectedScreen.width}x${selectedScreen.height}`);
    
    // Get system audio devices
    const systemAudioDevices = await audioDevices();
    let selectedAudioDevice = null;
    let captureSystemAudio = false;

    if (!systemAudioDevices || systemAudioDevices.length === 0) {
      console.warn('⚠️ No system audio device available');
    } else {
      // Ask if user wants to capture system audio
      const captureAudio = await question('\nDo you want to capture system audio? (Y/n): ');
      captureSystemAudio = captureAudio.toLowerCase() !== 'n';

      if (captureSystemAudio) {
        // Choose an audio device
        selectedAudioDevice = await chooseDevice(systemAudioDevices, 'audio');
        if (selectedAudioDevice) {
          console.log(`\n✅ Selected audio device: ${selectedAudioDevice.name} (ID=${selectedAudioDevice.id})`);
        }
      }
    }
    
    // Get microphones
    let micDevices = [];
    let selectedMic = null;
    let captureMicrophone = false;

    try {
      micDevices = await microphoneDevices();

      if (!micDevices || micDevices.length === 0) {
        console.warn('⚠️ No microphone available');
      } else {
        // Ask if user wants to capture microphone
        const captureMic = await question('\nDo you want to capture microphone? (Y/n): ');
        captureMicrophone = captureMic.toLowerCase() !== 'n';

        if (captureMicrophone) {
          // Choose a microphone
          selectedMic = await chooseDevice(micDevices, 'microphone');
          if (selectedMic) {
            console.log(`\n✅ Selected microphone: ${selectedMic.name} (ID=${selectedMic.id})`);
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Microphone capture not available: ${error.message}`);
    }
    
    // Check that at least one audio source is selected
    if (!captureSystemAudio && !captureMicrophone) {
      console.error('❌ Error: No audio source selected. At least one source is required.');
      rl.close();
      return;
    }

    // Ask for recording duration
    const durationInput = await question(`\nRecording duration in seconds (default: ${RECORDING_DURATION/1000}): `);
    const duration = durationInput === '' ? RECORDING_DURATION : parseInt(durationInput, 10) * 1000;

    if (isNaN(duration) || duration <= 0) {
      console.log(`Invalid duration, using default value: ${RECORDING_DURATION/1000} seconds`);
    }
    
    // Create a recorder
    const recorder = createScreenRecorder();

    // Prepare options
    const options = {
      // Screen required even for audio only
      screenId: selectedScreen.id,
      // Audio
      captureSystemAudio: !!selectedAudioDevice,
      microphoneDeviceId: selectedMic?.id,
      // Option to automatically convert to MP3
      audioOnly: true,
      // Minimal settings since we only keep audio
      fps: 1,
      showCursor: false,
      highlightClicks: false,
      cropArea: {
        x: 0,
        y: 0,
        width: 1,
        height: 1
      }
    };

    console.log('\nRecording options:');
    console.log(JSON.stringify(options, null, 2));

    // Ask for confirmation to start
    const startConfirm = await question('\nStart audio recording? (Y/n): ');

    if (startConfirm.toLowerCase() === 'n') {
      console.log('Recording cancelled.');
      rl.close();
      return;
    }

    // Start recording
    console.log('\nStarting audio recording...');
    await recorder.startRecording(options);
    
    // Open YouTube in browser
    const youtubeURL = 'https://www.youtube.com/watch?v=xvFZjo5PgG0';
    await openYouTubeInBrowser(youtubeURL);

    console.log(`\nRecording in progress for ${duration/1000} seconds...`);

    if (captureMicrophone) {
      console.log('Speak into your microphone to test audio capture!');
    }

    // Wait for the specified duration
    await new Promise(resolve => setTimeout(resolve, duration));

    // Stop recording
    console.log('Stopping recording...');
    const audioPath = await recorder.stopRecording();

    console.log(`\n✅ Audio recorded at: ${audioPath}`);
    console.log('   Recording contains:');
    console.log(`   - System audio: ${captureSystemAudio ? '✅' : '❌'}`);
    console.log(`   - Microphone audio: ${captureMicrophone ? '✅' : '❌'}`);
    
    rl.close();
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement:', error);
    rl.close();
  }
}

main(); 