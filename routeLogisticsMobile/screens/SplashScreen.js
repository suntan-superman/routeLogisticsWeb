import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
  Text,
  Pressable,
  BackHandler,
  AccessibilityInfo,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from '../constants/colors';
import { useAuth } from '../contexts/AuthContext';

// Get screen dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Animation Configuration
const ANIMATION_CONFIG = {
  LETTER_DELAY: 100,
  LETTER_DURATION: 300,
  LOGO_DURATION: 800,
  FADE_DURATION: 600,
  PROGRESS_DURATION: 3000,
  AUTO_NAVIGATE_DELAY: 5000,
  PHASE_DURATION: 750,
};

// Brand Configuration
const BRAND_CONFIG = {
  PRIMARY_WORD: "ROUTE LOGISTICS",
  SECONDARY_WORD: "FIELD SERVICE SOLUTIONS",
  TAGLINE: "Your Handyman. Your Way.",
  PRIMARY_COLOR: COLORS.primary[500], // Green theme
  SECONDARY_COLOR: COLORS.white,
  ACCENT_COLOR: COLORS.accent.blue,
  BACKGROUND_GRADIENT: {
    start: COLORS.primary[800],
    end: COLORS.primary[900],
  },
};

// Loading States
const LOADING_PHASES = [
  { id: 1, text: "Initializing...", duration: 800 },
  { id: 2, text: "Loading Services...", duration: 1000 },
  { id: 3, text: "Setting Up Interface...", duration: 800 },
  { id: 4, text: "Almost Ready...", duration: 600 },
];

/**
 * Enhanced letter animation component with native animations
 */
const LetterAnimation = React.memo(({
  letter,
  index,
  color,
  fontSize,
  startDelay,
  onAnimationComplete
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    const animationDelay = startDelay + (index * ANIMATION_CONFIG.LETTER_DELAY);

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ANIMATION_CONFIG.LETTER_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(translateAnim, {
          toValue: 0,
          duration: ANIMATION_CONFIG.LETTER_DURATION,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.1,
            duration: ANIMATION_CONFIG.LETTER_DURATION / 2,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: ANIMATION_CONFIG.LETTER_DURATION / 2,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      // Notify completion for the last letter
      if (onAnimationComplete && index === 0) {
        setTimeout(() => {
          onAnimationComplete();
        }, ANIMATION_CONFIG.LETTER_DURATION);
      }
    }, animationDelay);

    return () => clearTimeout(timer);
  }, [index, startDelay, onAnimationComplete]);

  return (
    <Animated.Text
      style={[
        styles.letter,
        {
          color,
          fontSize,
          opacity: fadeAnim,
          transform: [
            { translateY: translateAnim },
            { scale: scaleAnim },
          ],
        },
      ]}
      accessibilityLabel={letter === ' ' ? 'space' : letter}
    >
      {letter}
    </Animated.Text>
  );
});

/**
 * Animated word component with enhanced effects
 */
const WordAnimation = React.memo(({
  word,
  color,
  fontSize,
  startDelay,
  onComplete
}) => {
  return (
    <View style={styles.wordContainer}>
      {word.split("").map((letter, index) => (
        <LetterAnimation
          key={`${word}-${index}`}
          letter={letter}
          index={word.length - 1 - index} // Reverse order for right-to-left effect
          color={color}
          fontSize={fontSize}
          startDelay={startDelay}
          onAnimationComplete={index === word.length - 1 ? onComplete : null}
        />
      ))}
    </View>
  );
});

/**
 * Animated logo reveal component
 */
const LogoReveal = React.memo(({ visible, onComplete }) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(-180)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: ANIMATION_CONFIG.LOGO_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ANIMATION_CONFIG.FADE_DURATION,
          useNativeDriver: true,
        }),
      ]).start();

      setTimeout(() => {
        onComplete?.();
      }, ANIMATION_CONFIG.LOGO_DURATION);
    }
  }, [visible, onComplete]);

  if (!visible) return null;

  const rotate = rotateAnim.interpolate({
    inputRange: [-180, 0],
    outputRange: ['-180deg', '0deg'],
  });

  return (
    <Animated.View
      style={[
        styles.logoContainer,
        {
          opacity: fadeAnim,
          transform: [
            { scale: scaleAnim },
            { rotate },
          ],
        },
      ]}
    >
      <View style={styles.logoCircle}>
        <Ionicons 
          name="construct" 
          size={40} 
          color={BRAND_CONFIG.SECONDARY_COLOR} 
        />
      </View>
    </Animated.View>
  );
});

/**
 * Progress indicator component with percentage
 */
const ProgressIndicator = React.memo(({ visible, onComplete }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [currentPhase, setCurrentPhase] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!visible) return;

    // Fade in the progress container
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIMATION_CONFIG.FADE_DURATION,
      useNativeDriver: true,
    }).start();

    // Animate through all phases
    const animatePhases = async () => {
      for (let i = 0; i < LOADING_PHASES.length; i++) {
        setCurrentPhase(i);

        // Animate progress bar for this phase
        const targetProgress = ((i + 1) / LOADING_PHASES.length) * 100;

        Animated.timing(progressAnim, {
          toValue: targetProgress,
          duration: LOADING_PHASES[i].duration,
          useNativeDriver: false,
        }).start();

        // Update progress state for percentage display
        const progressTimer = setInterval(() => {
          setProgress(prev => {
            const newProgress = Math.min(prev + 2, targetProgress);
            return newProgress;
          });
        }, 50);

        // Wait for phase duration
        await new Promise(resolve => setTimeout(resolve, LOADING_PHASES[i].duration));
        clearInterval(progressTimer);
      }

      // Complete animation
      setTimeout(() => {
        onComplete?.();
      }, 500);
    };

    animatePhases();
  }, [visible, onComplete]);

  if (!visible) return null;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[styles.progressContainer, { opacity: fadeAnim }]}>
      <Text style={styles.progressText} accessibilityLiveRegion="polite">
        {LOADING_PHASES[currentPhase]?.text || "Loading..."}
      </Text>

      <View style={styles.progressBarBackground}>
        <Animated.View
          style={[
            styles.progressBar,
            { width: progressWidth }
          ]}
        />
      </View>

      <Text style={styles.progressPercentage}>
        {Math.round(progress)}%
      </Text>
    </Animated.View>
  );
});

/**
 * Skip button component
 */
const SkipButton = React.memo(({ visible, onPress }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.skipContainer, { opacity: fadeAnim }]}>
      <Pressable
        style={styles.skipButton}
        onPress={onPress}
        accessibilityLabel="Skip animation"
        accessibilityHint="Tap to skip the loading animation and go directly to login"
      >
        <Text style={styles.skipText}>Skip</Text>
        <Ionicons name="arrow-forward" size={16} color={BRAND_CONFIG.SECONDARY_COLOR} />
      </Pressable>
    </Animated.View>
  );
});

/**
 * Main SplashScreen component
 */
const SplashScreen = ({ navigation }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const timeoutRef = useRef(null);
  const backgroundFade = useRef(new Animated.Value(0)).current;

  // Animation states
  const [animationState, setAnimationState] = useState({
    showLogo: false,
    showProgress: false,
    showSkip: false,
    isComplete: false,
  });

  /**
   * Handles navigation to the next screen
   */
  const handleNavigate = useCallback(() => {
    setAnimationState(prev => {
      // If already complete, don't navigate again
      if (prev.isComplete) return prev;

      // Clear any pending timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Fade out and navigate
      Animated.timing(backgroundFade, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        // Call the navigation function passed from App.js
        try {
          if (navigation && navigation.navigate) {
            navigation.navigate();
          }
        } catch (error) {
          console.log('Navigation error prevented:', error.message);
        }
      });

      return { ...prev, isComplete: true };
    });
  }, [navigation]);

  /**
   * Animation sequence completion handlers
   */
  const handleFirstWordComplete = useCallback(() => {
    setAnimationState(prev => ({ ...prev, showLogo: true }));
  }, []);

  const handleLogoComplete = useCallback(() => {
    setAnimationState(prev => ({
      ...prev,
      showProgress: true,
      showSkip: true,
    }));
  }, []);

  const handleProgressComplete = useCallback(() => {
    handleNavigate();
  }, [handleNavigate]);

  const handleSkip = useCallback(() => {
    handleNavigate();
  }, [handleNavigate]);

  // Initialize animation sequence
  useEffect(() => {
    // Fade in background
    Animated.timing(backgroundFade, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // Set auto-navigation timeout
    timeoutRef.current = setTimeout(() => {
      handleNavigate();
    }, ANIMATION_CONFIG.AUTO_NAVIGATE_DELAY);

    // Handle Android back button
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleNavigate();
      return true;
    });

    // Announce screen for accessibility
    AccessibilityInfo.announceForAccessibility('Route Logisitics app is loading');

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      backHandler.remove();
    };
  }, []); // Empty dependency array - only run once on mount

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={BRAND_CONFIG.BACKGROUND_GRADIENT.start}
        translucent={false}
      />

      {/* Animated Background */}
      <Animated.View style={[
        styles.backgroundGradient,
        { opacity: backgroundFade }
      ]} />

      {/* Main Content */}
      <View style={styles.contentContainer}>
        {/* Brand Animation */}
        <View style={styles.brandContainer}>
          <WordAnimation
            word={BRAND_CONFIG.PRIMARY_WORD}
            color={BRAND_CONFIG.PRIMARY_COLOR}
            fontSize={36}
            startDelay={300}
            onComplete={handleFirstWordComplete}
          />

          <WordAnimation
            word={BRAND_CONFIG.SECONDARY_WORD}
            color={BRAND_CONFIG.SECONDARY_COLOR}
            fontSize={21}
            startDelay={1200}
          />

          {/* Logo Reveal */}
          <LogoReveal
            visible={animationState.showLogo}
            onComplete={handleLogoComplete}
          />

          {/* Tagline */}
          <Text style={styles.tagline} accessibilityLabel="Your Handyman. Your Way.">
            {BRAND_CONFIG.TAGLINE}
          </Text>
        </View>

        {/* Progress Indicator */}
        <ProgressIndicator
          visible={animationState.showProgress}
          onComplete={handleProgressComplete}
        />
      </View>

      {/* Skip Button */}
      <SkipButton
        visible={animationState.showSkip}
        onPress={handleSkip}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND_CONFIG.BACKGROUND_GRADIENT.start,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND_CONFIG.BACKGROUND_GRADIENT.end,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 80,
  },
  wordContainer: {
    flexDirection: 'row',
    marginVertical: 8,
  },
  letter: {
    fontWeight: '700',
    marginHorizontal: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  logoContainer: {
    marginVertical: 20,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: BRAND_CONFIG.PRIMARY_COLOR,
  },
  tagline: {
    fontSize: 12,
    color: BRAND_CONFIG.SECONDARY_COLOR,
    textAlign: 'center',
    marginTop: 16,
    opacity: 0.8,
    letterSpacing: 0.5,
  },
  progressContainer: {
    width: SCREEN_WIDTH - 80,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 10.5,
    color: BRAND_CONFIG.SECONDARY_COLOR,
    marginBottom: 16,
    textAlign: 'center',
    opacity: 0.9,
  },
  progressBarBackground: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBar: {
    height: '100%',
    backgroundColor: BRAND_CONFIG.PRIMARY_COLOR,
    borderRadius: 2,
  },
  progressPercentage: {
    fontSize: 9,
    color: BRAND_CONFIG.SECONDARY_COLOR,
    opacity: 0.7,
  },
  skipContainer: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1000,
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  skipText: {
    fontSize: 14,
    color: BRAND_CONFIG.SECONDARY_COLOR,
    marginRight: 6,
  },
});

export default SplashScreen;
