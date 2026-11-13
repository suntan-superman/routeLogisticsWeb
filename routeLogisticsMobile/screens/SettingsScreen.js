import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  Switch,
  TextInput,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { AuthContext } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { FONT_SIZES, SPACING, BORDER_RADIUS, hp, wp } from '../constants/responsiveSizes';
import ServiceSelectionScreen from './ServiceSelectionScreen';

const SettingsScreen = ({ navigation }) => {
  const { user, updateUserProfile, signOut } = useContext(AuthContext);
  const { t, language, changeLanguage } = useLanguage();
  const [showServiceSelection, setShowServiceSelection] = useState(false);
  const [userServices, setUserServices] = useState(user?.services || []);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [businessName, setBusinessName] = useState(user?.businessName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [address, setAddress] = useState(user?.address || '');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setUserServices(user.services || []);
      setBusinessName(user.businessName || '');
      setPhoneNumber(user.phoneNumber || '');
      setAddress(user.address || '');
    }
  }, [user]);

  const handleServiceSelection = (services) => {
    setUserServices(services);
    setShowServiceSelection(false);
    // Update user profile with new services
    updateUserServices(services);
  };

  const updateUserServices = async (services) => {
    setIsLoading(true);
    try {
      const result = await updateUserProfile({
        services: services,
        serviceCategories: getServiceCategories(services)
      });
      
      if (result.success) {
        Alert.alert('Success', 'Your services have been updated successfully.');
      } else {
        Alert.alert('Error', 'Failed to update services. Please try again.');
      }
    } catch (error) {
      console.error('Error updating services:', error);
      Alert.alert('Error', 'Failed to update services. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getServiceCategories = (services) => {
    // This would map services back to categories for easier filtering
    return services;
  };

  const handleSaveProfile = async () => {
    setIsLoading(true);
    try {
      const result = await updateUserProfile({
        businessName,
        phoneNumber,
        address,
        notificationsEnabled,
        emailNotifications,
        smsNotifications,
      });
      
      if (result.success) {
        Alert.alert('Success', 'Your profile has been updated successfully.');
      } else {
        Alert.alert('Error', 'Failed to update profile. Please try again.');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
          }
        }
      ]
    );
  };


  // Show service selection screen if needed
  if (showServiceSelection) {
    return (
      <ServiceSelectionScreen
        navigation={navigation}
        onServicesSelected={handleServiceSelection}
        initialServices={userServices}
      />
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background.primary} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Information Section */}
        <Text style={[styles.sectionTitle, { marginTop: SPACING.LARGE }]}>Profile Information</Text>
        
        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="business" size={20} color={COLORS.primary[500]} style={styles.icon} />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Business Name</Text>
              <TextInput
                style={styles.textInput}
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="Enter your business name"
              />
            </View>
          </View>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="phone" size={20} color={COLORS.primary[500]} style={styles.icon} />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Phone Number</Text>
              <TextInput
                style={styles.textInput}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Enter your phone number"
                keyboardType="phone-pad"
              />
            </View>
          </View>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="location-on" size={20} color={COLORS.primary[500]} style={styles.icon} />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Address</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={address}
                onChangeText={setAddress}
                placeholder="Enter your business address"
                multiline
                numberOfLines={3}
              />
            </View>
          </View>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="language" size={20} color={COLORS.primary[500]} style={styles.icon} />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Language</Text>
              <View style={styles.languageSelector}>
                <TouchableOpacity
                  style={[styles.languageOption, language === 'English' && styles.languageOptionSelected]}
                  onPress={() => changeLanguage('English')}
                >
                  <Text style={[styles.languageOptionText, language === 'English' && styles.languageOptionTextSelected]}>
                    English
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.languageOption, language === 'Spanish' && styles.languageOptionSelected]}
                  onPress={() => changeLanguage('Spanish')}
                >
                  <Text style={[styles.languageOptionText, language === 'Spanish' && styles.languageOptionTextSelected]}>
                    Español
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Spacer between Profile and Services */}
        <View style={{ height: SPACING.SMALL }} />

        {/* Services Section */}
        <Text style={styles.sectionTitle}>Services</Text>
        
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => setShowServiceSelection(true)}
        >
          <View style={styles.settingLeft}>
            <MaterialIcons name="build" size={20} color={COLORS.primary[500]} style={styles.icon} />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Manage Services</Text>
              <Text style={styles.settingSubtitle}>
                {userServices.length} services selected
              </Text>
            </View>
          </View>
          <MaterialIcons name="arrow-forward-ios" size={16} color={COLORS.gray[500]} />
        </TouchableOpacity>

        {/* Spacer between Services and Notifications */}
        <View style={{ height: SPACING.SMALL }} />

        {/* Notifications Section */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        
        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="notifications" size={20} color={COLORS.primary[500]} style={styles.icon} />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Push Notifications</Text>
              <Text style={styles.settingSubtitle}>Receive app notifications</Text>
            </View>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: COLORS.gray[300], true: COLORS.primary[300] }}
            thumbColor={notificationsEnabled ? COLORS.primary[500] : COLORS.gray[500]}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="email" size={20} color={COLORS.primary[500]} style={styles.icon} />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Email Notifications</Text>
              <Text style={styles.settingSubtitle}>Receive email updates</Text>
            </View>
          </View>
          <Switch
            value={emailNotifications}
            onValueChange={setEmailNotifications}
            trackColor={{ false: COLORS.gray[300], true: COLORS.primary[300] }}
            thumbColor={emailNotifications ? COLORS.primary[500] : COLORS.gray[500]}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="sms" size={20} color={COLORS.primary[500]} style={styles.icon} />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>SMS Notifications</Text>
              <Text style={styles.settingSubtitle}>Receive text messages</Text>
            </View>
          </View>
          <Switch
            value={smsNotifications}
            onValueChange={setSmsNotifications}
            trackColor={{ false: COLORS.gray[300], true: COLORS.primary[300] }}
            thumbColor={smsNotifications ? COLORS.primary[500] : COLORS.gray[500]}
          />
        </View>

        {/* Spacer between Notifications and Account */}
        <View style={{ height: SPACING.SMALL }} />

        {/* Account Section */}
        <Text style={styles.sectionTitle}>Account</Text>
        
        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="email" size={20} color={COLORS.primary[500]} style={styles.icon} />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Email Address</Text>
              <Text style={styles.settingSubtitle}>{user?.email}</Text>
            </View>
          </View>
          <MaterialIcons name="verified" size={16} color={COLORS.green[500]} />
        </View>

        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="lock" size={20} color={COLORS.primary[500]} style={styles.icon} />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Change Password</Text>
              <Text style={styles.settingSubtitle}>Update your password</Text>
            </View>
          </View>
          <MaterialIcons name="arrow-forward-ios" size={16} color={COLORS.gray[500]} />
        </TouchableOpacity>

        {/* Spacer between Account and Save Button */}
        <View style={{ height: SPACING.SMALL }} />

        {/* Save Changes Button */}
        <View style={styles.saveSection}>
          <TouchableOpacity
            style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
            onPress={handleSaveProfile}
            disabled={isLoading}
          >
            <Text style={styles.saveButtonText}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: hp('6%'),
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.primary[500],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[200],
  },
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.white,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.SMALL,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.SMALL,
    fontWeight: 'bold',
    color: COLORS.text.secondary,
    marginTop: SPACING.SMALL,
    marginBottom: SPACING.TINY,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.SMALL,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.SMALL,
    marginBottom: SPACING.TINY / 2,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    marginRight: SPACING.SMALL,
    width: 18,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: FONT_SIZES.SMALL,
    fontWeight: '500',
    color: COLORS.text.primary,
  },
  settingSubtitle: {
    fontSize: FONT_SIZES.TINY,
    color: COLORS.text.secondary,
    marginTop: 1,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    borderRadius: BORDER_RADIUS.SMALL,
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    fontSize: FONT_SIZES.SMALL,
    backgroundColor: COLORS.gray[50],
    color: COLORS.text.primary,
    marginTop: SPACING.TINY,
  },
  textArea: {
    height: 40,
    textAlignVertical: 'top',
  },
  saveSection: {
    marginTop: SPACING.SMALL,
    marginBottom: SPACING.SMALL,
    paddingHorizontal: SPACING.SMALL,
  },
  saveButton: {
    backgroundColor: COLORS.primary[500],
    paddingVertical: SPACING.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    borderRadius: BORDER_RADIUS.SMALL,
    alignItems: 'center',
    shadowColor: COLORS.primary[500],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonDisabled: {
    backgroundColor: COLORS.gray[400],
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    fontSize: FONT_SIZES.SMALL,
    fontWeight: '600',
    color: COLORS.white,
  },
  bottomPadding: {
    height: SPACING.SMALL,
  },
  // Language Selector Styles
  languageSelector: {
    flexDirection: 'row',
    marginTop: SPACING.TINY,
  },
  languageOption: {
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    marginRight: SPACING.SMALL,
    backgroundColor: COLORS.white,
  },
  languageOptionSelected: {
    backgroundColor: COLORS.primary[500],
    borderColor: COLORS.primary[500],
  },
  languageOptionText: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.primary,
    fontWeight: '500',
  },
  languageOptionTextSelected: {
    color: COLORS.white,
  },
});

export default SettingsScreen;
