# USS Enterprise Computer Interface

## Project Overview
A voice-interactive web application that emulates the iconic Star Trek Enterprise Computer. Users can speak naturally to an AI-powered computer that responds with authentic Star Trek-style dialogue and information.

## Current State
**Status**: ✅ Fully functional MVP complete
- Voice input/output working via Web Speech API
- Gemini AI integration operational with Enterprise Computer personality
- LCARS-inspired UI design implemented
- Mobile-responsive layout complete
- Conversation context and history working

## Recent Changes

### December 1, 2025 - AirPods Hardware Tap Gesture (Not Supported - iOS Limitation)
- **Attempted AirPod tap gesture support**: Investigated using Media Session API to capture AirPod/Bluetooth hardware button events
- **Conclusion**: **NOT POSSIBLE on iOS Safari** due to WebKit limitations
- **Root cause**: iOS Safari only forwards Bluetooth hardware button events to web pages when the page is actively playing audible audio (like music). Silent audio tracks are ignored by iOS, and AirPod taps are handled at the OS level instead of being sent to the web app.
- **Apple's intentional design**: This is a security/UX decision - Apple prevents web pages from hijacking Bluetooth headphone controls unless actively playing audio content.
- **Alternative required**: To support AirPod tap gestures, a native iOS app wrapper (using Capacitor, React Native, or Swift) would be needed to access Apple's `MPRemoteCommandCenter` API.
- **Current solution**: Users must tap the on-screen microphone button to activate voice input on mobile devices. UI updated to clarify this limitation.

### November 30, 2025 - Bluetooth/AirPods Microphone Support (Complete)
- **Added Bluetooth and AirPods microphone support for mobile devices**: When users tap the microphone button with connected Bluetooth audio devices (AirPods, headsets), the app now properly routes audio input through those devices
- **Implementation**:
  - Added `initializeBluetoothAudio()` function in `useSpeechRecognition.ts`
  - Uses `navigator.mediaDevices.getUserMedia()` to "prime" the audio subsystem before starting speech recognition
  - Audio constraints include `echoCancellation`, `noiseSuppression`, and `autoGainControl` for better Bluetooth audio quality
  - The MediaStream is immediately stopped after initialization - it only serves to establish the audio route
  - Only activated on mobile devices (iOS/Android) where Bluetooth routing is needed
- **Logging**: Console logs show which audio device was selected, helping debug Bluetooth connectivity issues
- **Result**: Users can now speak through their AirPods or Bluetooth headsets on both iPhone and Android devices

### November 27, 2025 - Cross-Platform Voice Consistency (Complete)
- **Unified female computer voice across iOS, Android, and desktop**: Implemented consistent Star Trek computer voice selection using prioritized voice list
- **Voice priority order**: Zira (Windows), Samantha/Ava (iOS/macOS), Google UK/US English Female (Chrome/Android), generic female voices as fallback
- **Speech rate optimized**: Changed default rate from 1.0 to 0.9 for more deliberate, computer-like cadence
- **Implementation**:
  - Added `PREFERRED_VOICE_NAMES` constant with platform-appropriate female voices
  - Voice selection iterates through priority list, selects first available match
  - Filters to English voices first for reliability
  - Consistent voice selection logic in both `useSpeechSynthesis.ts` and `VoiceSettings.tsx`
- **Result**: All platforms now use a calm, professional female voice resembling the USS Enterprise computer

### November 27, 2025 - iOS Safari Voice Input & Output Fix (Complete)
- **Fixed iPhone voice input and output issues**: Resolved issues where (1) mic button captured voice but app didn't process it, and (2) AI responses were not being spoken on iOS Safari
- **Root causes identified**:
  - **Speech Recognition (Input)**: iOS Safari's `continuous: true` mode has unreliable `isFinal` flags; transcript processing depended on `voiceState` which could be reset before processing
  - **Speech Synthesis (Output)**: iOS Safari requires speech synthesis to be initiated from a user gesture context; by the time the API response arrived, the gesture context was lost
- **Solution implemented for Speech Recognition**:
  - Added `isIOSDevice()` detection function to identify iPhone/iPad/iPod
  - Set `recognition.continuous = false` for iOS (desktop/Android retain `continuous: true`)
  - Added iOS-specific 1.5-second silence detection timeout
  - Removed `voiceState` dependency from transcript processing
  - Added `isProcessingTranscriptRef` guard to prevent duplicate sends
- **Solution implemented for Speech Synthesis**:
  - Added `warmUp()` function that speaks a silent utterance to "unlock" iOS speech synthesis
  - `warmUp()` is called during user gestures (mic tap, hands-free toggle)
  - `speak()` auto-triggers warmup on iOS if not warmed up, queuing text until ready
  - Used `doSpeakRef` pattern to avoid React hook ordering issues
  - Pending text queue ensures responses are always spoken after warmup completes
- **Result**: iOS users now have reliable voice input AND output. The complete flow works: tap mic → speak → AI processes → computer responds with voice
- **Technical note**: These are Safari WebKit bugs that have persisted since iOS 15.1. Both fixes follow documented workarounds for Safari's Web Speech API limitations

### November 9, 2025 - Android Production Voice Solution: Manual Mode Only
- **Disabled continuous voice mode on Android production**: After extensive debugging of microphone "aborted" errors, implemented architectural solution to disable Voice Activity Detection (VAD) on mobile devices in production
- **Root cause analysis**: Android Chrome has strict OS-level microphone resource management that causes conflicts when VAD and Speech Recognition attempt sequential access, even with delays up to 600ms
- **Final solution implemented**:
  - Added `isContinuousModeAvailable()` helper to detect platform and environment
  - Disabled continuous (hands-free) mode entirely on mobile production builds
  - Manual mic mode (tap-to-speak) works reliably on all platforms including Android
  - Updated UI to show "Tap to speak (manual mode)" on mobile devices
  - Added user-friendly toast message if user attempts to enable continuous mode on mobile
  - Preserved all continuous mode functionality for desktop browsers
- **Result**: Android users now have a reliable voice input experience using manual mic mode. Desktop users retain full hands-free functionality. No more "aborted" errors or microphone conflicts.
- **Mobile Limitation**: Continuous voice mode is not available on mobile devices in production. Users must tap the microphone button each time they want to speak. This is a platform limitation due to Android's strict microphone resource management.

### October 26, 2025 - Android Manual Voice Input Fix
- **Fixed Android manual mic button issue**: Resolved issue where clicking the "ready" button turned it green but the computer didn't respond to voice input
- **Root cause**: Android browsers often fail to send final speech recognition results when using `continuous: true` mode, only sending interim results
- **Solution implemented**:
  - Process interim results immediately when recognition ends (onend event) on mobile devices
  - Process interim results on error (except aborted) to capture speech even in error scenarios
  - Added 2-second timeout as backup for cases where recognition doesn't auto-stop
  - stopListening() preserves interim results for onend to process (critical for manual stop)
  - Comprehensive logging to track interim result handling throughout the flow
- **Result**: Both manual and hands-free voice input now work correctly on Android devices in all scenarios (auto-stop, manual stop, error conditions)

### October 13, 2025 - Critical Android Hands-Free Fix
- **Fixed Android stuck green mic issue**: Resolved critical state management bug where hands-free mode showed green mic but didn't capture voice on Android browsers
- **Root cause**: Speech Recognition `isListening` state was being set optimistically before `onstart` event, creating invalid state when Android microphone handoff failed silently
- **Solution implemented**:
  - `isListening` state now ONLY set in `onstart` event handler (confirmed recognition actually started)
  - Added 2-second startup timeout to detect Android silent failures
  - Increased microphone handoff delay from 100ms to 300ms for Android resource release
  - Comprehensive timeout cleanup in all exit paths
- **Result**: Hands-free mode now properly detects voice, captures transcript, and processes on Android Chrome

### October 10, 2025
- Implemented complete Star Trek communicator application
- Created LCARS-inspired UI with authentic Trek aesthetics (orange, blue, purple accents)
- Integrated Gemini 2.5 Flash with custom Enterprise Computer system prompt
- Built voice interaction system using Web Speech API
- Added conversation history with context preservation
- Fixed Gemini API response handling to properly extract text
- Implemented defensive error handling for edge cases

## Project Architecture

### Frontend (`client/`)
- **Framework**: React with TypeScript
- **Routing**: Wouter (single page: Communicator)
- **Styling**: Tailwind CSS with LCARS design tokens
- **State Management**: React Query for API calls
- **Voice Input**: Web Speech Recognition API
- **Voice Output**: Web Speech Synthesis API

### Backend (`server/`)
- **Framework**: Express.js
- **AI Integration**: Google Gemini 2.5 Flash
- **API Routes**: `/api/chat` for conversation processing

### Key Components
1. **VoiceControlPanel**: Main communicator button with audio visualization
2. **ConversationDisplay**: Message history with role-based styling
3. **LCARSHeader**: Star Trek styled header with branding
4. **StatusIndicator**: Visual state indicators (Ready/Listening/Processing/Speaking)
5. **useSpeechRecognition**: Custom hook for voice input
6. **useSpeechSynthesis**: Custom hook for voice output

### Data Schema
```typescript
ConversationMessage {
  id: string
  role: "user" | "computer"
  text: string
  timestamp: number
}
```

## User Preferences
- Authentic Star Trek LCARS design aesthetic
- Voice-first interaction model
- Mobile-responsive experience
- Professional, computer-like AI responses

## Technical Details

### Environment Variables
- `GEMINI_API_KEY`: Required for AI responses
- `SESSION_SECRET`: For session management

### API Endpoints
- `POST /api/chat`: Send user message, receive computer response
  - Request: `{ message: string, conversationHistory?: ConversationMessage[] }`
  - Response: `{ message: string, messageId: string }`

### Design System
- **Primary Orange**: 25 100% 70% (LCARS signature color)
- **Secondary Blue**: 235 60% 75%
- **Accent Purple**: 290 40% 70%
- **Success Green**: 145 85% 60% (listening state)
- **Warning Yellow**: 45 100% 65% (processing state)

### Voice States
1. **Idle**: Ready for input
2. **Listening**: Capturing user speech
3. **Processing**: Sending to Gemini AI
4. **Speaking**: Computer responding with TTS

## Testing Notes
- API tested successfully with conversation context
- Gemini integration returns authentic Enterprise Computer responses
- Voice synthesis configured for computer-like voice (female, moderate pace)
- Responsive design works across mobile and desktop viewports

## Known Limitations
- Web Speech API browser compatibility (works best in Chrome/Edge)
- Speech recognition requires microphone permissions
- Text-to-speech voices vary by platform/browser

## Next Steps / Future Enhancements
- Voice activity detection for hands-free operation
- Conversation persistence across sessions
- Custom voice selection UI
- Star Trek sound effects library
- Enterprise systems status simulation
- Dark mode toggle (currently dark by default)
