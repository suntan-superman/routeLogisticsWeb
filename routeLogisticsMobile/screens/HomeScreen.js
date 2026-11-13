import React, { useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Image,
  AppState,
  RefreshControl,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import JobPhotos from '../components/JobPhotos';
import FieldWorkTools from '../components/FieldWorkTools';
import MyRoute from '../components/MyRoute';
import WorkLocation from '../components/WorkLocation';
import OfflineStatus from '../components/OfflineStatus';
import { canManage, localDate } from '../services/tenancy';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { GlassScreen, GlassCard, GlassButton, IconButton } from '../components/Glass';
import { AuthContext } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { CustomerService, JobService, EstimateService } from '../services/firebase';
import { FONT_SIZES, SPACING, BUTTON_SIZES, BORDER_RADIUS, ICON_SIZES, CARD_SIZES, WIDTHS, HEIGHTS, hp, wp, rf } from '../constants/responsiveSizes';

const HomeScreen = ({ navigation }) => {
  const { user, signOut, permissions, refreshUser } = useContext(AuthContext);
  const { colors: COLORS, palette, isDark } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const managing = permissions.canManage;
  const [jobsError, setJobsError] = useState('');
  const { t } = useLanguage();
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showScheduleServiceModal, setShowScheduleServiceModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Schedule Service Form State
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [notes, setNotes] = useState('');

  // Customer Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Customer data from Firebase
  const [customers, setCustomers] = useState([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

  // Job/Schedule data from Firebase
  const [jobs, setJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [activeFilter, setActiveFilter] = useState('day'); // 'day', 'week', 'month'
  const jobsRequest = useRef(0), jobsMounted = useRef(true);

  // Dropdown states
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  // Job details modal
  const [showJobDetailsModal, setShowJobDetailsModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  // Job completion modal
  const [showJobCompletionModal, setShowJobCompletionModal] = useState(false);
  const [showCompletionConfirmModal, setShowCompletionConfirmModal] = useState(false);
  const [actualWorkDone, setActualWorkDone] = useState('');
  const [actualHours, setActualHours] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');

  // Job editing states
  const [showJobEditModal, setShowJobEditModal] = useState(false);
  const [editJobData, setEditJobData] = useState({});
  const [isEditingJob, setIsEditingJob] = useState(false);

  // Estimates states
  const [showEstimatesModal, setShowEstimatesModal] = useState(false);
  const [showCreateEstimateModal, setShowCreateEstimateModal] = useState(false);
  const [estimates, setEstimates] = useState([]);
  const [isLoadingEstimates, setIsLoadingEstimates] = useState(false);
  const [estimateData, setEstimateData] = useState({
    customerName: '',
    serviceType: '',
    scopeOfWork: '',
    materials: '',
    laborHours: '',
    laborRate: '',
    materialCost: '',
    totalCost: '',
    notes: ''
  });
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  // Date and time picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDateTime, setSelectedDateTime] = useState(new Date());

  const photos = [];
  const routes = [];

  // Load customers and jobs when component mounts
  useEffect(() => {
    if (managing) loadCustomers();
  }, [managing]);

  // Data availability checks
  const hasCustomers = customers.length > 0;
  const hasJobs = jobs.length > 0;
  const hasPhotos = photos.length > 0;
  const hasRoutes = routes.length > 0;

  // Form validation
  const isScheduleFormValid = () => {
    return selectedCustomer && selectedService && selectedDate && selectedTime && duration;
  };

  const isCustomerFormValid = () => {
    return customerName && customerPhone && customerAddress;
  };

  // Reset form when modal closes
  const resetScheduleForm = () => {
    setSelectedCustomer('');
    setSelectedService('');
    setSelectedDate('');
    setSelectedTime('');
    setDuration('');
    setEstimatedCost('');
    setNotes('');
    setShowCustomerDropdown(false);
    setShowServiceDropdown(false);
  };

  const resetCustomerForm = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerEmail('');
  };

  // Load customers from Firebase
  const loadCustomers = async () => {
    setIsLoadingCustomers(true);
    try {
      const result = await CustomerService.getCustomers();
      if (result.success) {
        setCustomers(result.customers);
      } else {
        Alert.alert('Error', 'Failed to load customers');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load customers');
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  // Load jobs from Firebase based on active filter
  const loadJobs = useCallback(async () => {
    if (!jobsMounted.current) return;
    const request = ++jobsRequest.current;
    setIsLoadingJobs(true); setJobsError('');
    try {
      let result;
      switch (activeFilter) {
        case 'day':
          result = await JobService.getTodaysJobs();
          break;
        case 'week':
          result = await JobService.getThisWeeksJobs();
          break;
        case 'month':
          result = await JobService.getThisMonthsJobs();
          break;
        default:
          result = await JobService.getTodaysJobs();
      }

      if (!jobsMounted.current || request !== jobsRequest.current) return;
      if (result.success) {
        setJobs(result.jobs);
      } else {
        setJobs([]); setJobsError(result.error?.message || result.error || 'Could not load your schedule.');
      }
    } catch (error) {
      if (jobsMounted.current && request === jobsRequest.current) {
        setJobs([]); setJobsError('Could not load your schedule. Please refresh.');
      }
    } finally {
      if (jobsMounted.current && request === jobsRequest.current) setIsLoadingJobs(false);
    }
  }, [activeFilter, user.id, user.companyId, user.role, user.membershipId]);

  // Remote assignments are fetched when returning to work or reconnecting.
  // Only the latest request for the current filter/workspace may update the list.
  useEffect(() => {
    jobsMounted.current = true;
    loadJobs();
    let previousState = AppState.currentState, connected = null;
    const app = AppState.addEventListener('change', state => {
      const returning = state === 'active' && previousState !== 'active';
      previousState = state;
      if (returning) loadJobs();
    });
    const network = NetInfo.addEventListener(state => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      const reconnected = connected === false && online;
      connected = online;
      if (reconnected && AppState.currentState === 'active') loadJobs();
    });
    return () => { jobsMounted.current = false; jobsRequest.current++; app.remove(); network(); };
  }, [loadJobs]);

  // Add customer to Firebase
  const addCustomerToFirebase = async (customerData) => {
    try {
      const result = await CustomerService.addCustomer(customerData);
      if (result.success) {
        // Reload customers to get the updated list
        await loadCustomers();
        return true;
      } else {
        Alert.alert('Error', result.error.message);
        return false;
      }
    } catch (error) {
      console.error('Add customer error:', error);
      Alert.alert('Error', 'Failed to add customer');
      return false;
    }
  };

  // Delete customer from Firebase
  const deleteCustomerFromFirebase = async (customerId) => {
    try {
      const result = await CustomerService.deleteCustomer(customerId);
      if (result.success) {
        // Reload customers to get the updated list
        await loadCustomers();
        return true;
      } else {
        Alert.alert('Error', result.error.message);
        return false;
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to delete customer');
      return false;
    }
  };

  // Data check handlers
  const handleScheduleServicePress = () => {
    if (!canManage()) { Alert.alert('Manager access required', 'Ask your manager to make this change.'); return; }
    if (!hasCustomers) {
      Alert.alert(
        'No Customers Available',
        'You need to add customers before scheduling services. Would you like to add a customer now?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Add Customer', 
            onPress: () => setShowCustomerModal(true)
          }
        ]
      );
      return;
    }
    setShowScheduleServiceModal(true);
  };

  const handleSchedulePress = () => {
    // Always load jobs when opening schedule modal
    loadJobs();
    setShowScheduleModal(true);
  };


  const handleViewRoutesPress = () => {
    if (!hasRoutes) {
      Alert.alert(
        'No Routes Available',
        'You don\'t have any routes planned yet. Routes are created when you have multiple appointments in the same area.',
        [
          { text: 'OK', style: 'default' }
        ]
      );
      return;
    }
    Alert.alert('Routes', 'Route optimization functionality coming soon!');
  };

  // Helper function to get icon for service
  const getServiceIcon = (service) => {
    const serviceLower = service.toLowerCase();
    if (serviceLower.includes('pool') || serviceLower.includes('spa')) return 'pool';
    if (serviceLower.includes('pest') || serviceLower.includes('bug') || serviceLower.includes('ant') || serviceLower.includes('spider')) return 'bug-report';
    if (serviceLower.includes('electrical') || serviceLower.includes('lighting') || serviceLower.includes('fixture')) return 'electrical-services';
    if (serviceLower.includes('plumbing') || serviceLower.includes('faucet') || serviceLower.includes('toilet')) return 'plumbing';
    if (serviceLower.includes('carpentry') || serviceLower.includes('wood') || serviceLower.includes('deck')) return 'carpenter';
    if (serviceLower.includes('painting') || serviceLower.includes('paint')) return 'format-paint';
    if (serviceLower.includes('cleaning') || serviceLower.includes('maintenance')) return 'cleaning-services';
    if (serviceLower.includes('hvac') || serviceLower.includes('heating') || serviceLower.includes('cooling')) return 'ac-unit';
    if (serviceLower.includes('outdoor') || serviceLower.includes('yard') || serviceLower.includes('lawn')) return 'yard';
    if (serviceLower.includes('hauling') || serviceLower.includes('moving')) return 'local-shipping';
    return 'handyman';
  };

  // Helper function to get color for service
  const getServiceColor = (service) => {
    const serviceLower = service.toLowerCase();
    if (serviceLower.includes('pool') || serviceLower.includes('spa')) return COLORS.accent.pool;
    if (serviceLower.includes('pest') || serviceLower.includes('bug')) return COLORS.accent.pest;
    if (serviceLower.includes('electrical') || serviceLower.includes('lighting')) return COLORS.accent.blue;
    if (serviceLower.includes('plumbing')) return COLORS.accent.blue;
    if (serviceLower.includes('carpentry') || serviceLower.includes('wood')) return COLORS.accent.orange;
    if (serviceLower.includes('painting') || serviceLower.includes('paint')) return COLORS.accent.purple;
    if (serviceLower.includes('cleaning') || serviceLower.includes('maintenance')) return COLORS.accent.green;
    if (serviceLower.includes('hvac')) return COLORS.accent.blue;
    if (serviceLower.includes('outdoor') || serviceLower.includes('yard')) return COLORS.accent.green;
    if (serviceLower.includes('hauling') || serviceLower.includes('moving')) return COLORS.accent.orange;
    return COLORS.primary[500];
  };

  // Helper function to get description for service
  const getServiceDescription = (service) => {
    const serviceLower = service.toLowerCase();
    if (serviceLower.includes('pool') || serviceLower.includes('spa')) return 'Professional pool maintenance and cleaning services';
    if (serviceLower.includes('pest') || serviceLower.includes('bug')) return 'Comprehensive pest management solutions';
    if (serviceLower.includes('electrical') || serviceLower.includes('lighting')) return 'Electrical installation and repair services';
    if (serviceLower.includes('plumbing')) return 'Plumbing installation and repair services';
    if (serviceLower.includes('carpentry') || serviceLower.includes('wood')) return 'Custom carpentry and woodworking services';
    if (serviceLower.includes('painting') || serviceLower.includes('paint')) return 'Interior and exterior painting services';
    if (serviceLower.includes('cleaning') || serviceLower.includes('maintenance')) return 'Cleaning and maintenance services';
    if (serviceLower.includes('hvac')) return 'Heating, ventilation, and air conditioning services';
    if (serviceLower.includes('outdoor') || serviceLower.includes('yard')) return 'Outdoor and yard maintenance services';
    if (serviceLower.includes('hauling') || serviceLower.includes('moving')) return 'Hauling and moving assistance services';
    return 'Professional handyman services';
  };

  // Date and time picker handlers
  const handleDateChange = (event, selectedDate) => {
    // On Android, close immediately. On iOS, keep open until "Done" is pressed
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }

    if (selectedDate) {
      setSelectedDateTime(selectedDate);
      const dateString = localDate(selectedDate);
      setSelectedDate(dateString);

      // If we're in edit mode, update the edit job data
      if (showJobEditModal) {
        setEditJobData({...editJobData, date: dateString});
      }
    }
  };

  const closeDatePicker = () => {
    setShowDatePicker(false);
    // Reopen appropriate modal on iOS
    if (Platform.OS === 'ios') {
      setTimeout(() => {
        if (showJobEditModal) {
          setShowJobEditModal(true);
        } else {
          setShowScheduleServiceModal(true);
        }
      }, 100);
    }
  };

  const handleTimeChange = (event, selectedTime) => {
    // On Android, close immediately. On iOS, keep open until "Done" is pressed
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }

    if (selectedTime) {
      // Round to nearest quarter hour
      const minutes = selectedTime.getMinutes();
      const roundedMinutes = Math.round(minutes / 15) * 15;

      // Create new date with rounded time
      const roundedTime = new Date(selectedTime);
      roundedTime.setMinutes(roundedMinutes);

      const timeString = roundedTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      setSelectedTime(timeString);

      // If we're in edit mode, update the edit job data
      if (showJobEditModal) {
        setEditJobData({...editJobData, time: timeString});
      }
    }
  };

  const closeTimePicker = () => {
    setShowTimePicker(false);
    // Reopen appropriate modal on iOS
    if (Platform.OS === 'ios') {
      setTimeout(() => {
        if (showJobEditModal) {
          setShowJobEditModal(true);
        } else {
          setShowScheduleServiceModal(true);
        }
      }, 100);
    }
  };

  const openDatePicker = () => {
    // On iOS, close the current modal temporarily to show picker
    if (Platform.OS === 'ios') {
      if (showJobEditModal) {
        setShowJobEditModal(false);
      } else {
        setShowScheduleServiceModal(false);
      }
      setTimeout(() => {
        setShowDatePicker(true);
      }, 100);
    } else {
      setShowDatePicker(true);
    }
  };

  const openTimePicker = () => {
    // On iOS, close the current modal temporarily to show picker
    if (Platform.OS === 'ios') {
      if (showJobEditModal) {
        setShowJobEditModal(false);
      } else {
        setShowScheduleServiceModal(false);
      }
      setTimeout(() => {
        setShowTimePicker(true);
      }, 100);
    } else {
      setShowTimePicker(true);
    }
  };

  // Handle job selection for details
  const handleJobSelection = (job) => {
    setSelectedJob(job);

    // On iOS, close schedule modal first to avoid modal stacking issues
    if (Platform.OS === 'ios') {
      setShowScheduleModal(false);
      setTimeout(() => {
        setShowJobDetailsModal(true);
      }, 100);
    } else {
      setShowJobDetailsModal(true);
    }
  };

  // Handle job completion
  const handleJobCompletion = (job) => {
    setSelectedJob(job);
    setActualWorkDone('');
    setActualHours('');
    setCompletionNotes('');
    setShowJobCompletionModal(true);
  };

  // Handle job editing
  const handleJobEdit = (job) => {
    if (!canManage()) { Alert.alert('Manager access required', 'Ask your manager to make this change.'); return; }
    setSelectedJob(job);
    setEditJobData({
      customerName: job.customerName || '',
      serviceType: job.serviceType || '',
      date: job.date || '',
      time: job.time || '',
      duration: job.duration || '',
      estimatedCost: job.estimatedCost || '',
      notes: job.notes || '',
      status: job.status || 'scheduled'
    });
    setIsEditingJob(true);
    setShowJobEditModal(true);
  };

  // Save edited job
  const saveEditedJob = async () => {
    if (!selectedJob) return;

    setIsEditingJob(true);

    try {
      const updatedJobData = {
        ...editJobData,
        updatedAt: new Date().toISOString()
      };

      const result = await JobService.updateJob(selectedJob.id, updatedJobData);

      if (result.success) {
        Alert.alert('Success', 'Job updated successfully!');
        setShowJobEditModal(false);
        setShowJobDetailsModal(false);
        loadJobs(); // Refresh the jobs list
      } else {
        Alert.alert('Error', result.error?.message || 'Failed to update job');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update job');
    } finally {
      setIsEditingJob(false);
    }
  };

  // Load estimates from Firebase
  const loadEstimates = async () => {
    setIsLoadingEstimates(true);
    try {
      const result = await EstimateService.getEstimates();

      if (result.success) {
        setEstimates(result.estimates);
        // Don't show error if no estimates exist yet - this is normal for new users
        if (result.estimates.length === 0) {
        }
      } else {
        console.error('EstimateService error:', result.error);
        // Only show error alert for actual errors, not empty results
        if (result.error.message !== 'Failed to fetch estimates') {
          Alert.alert('Error', result.error.message);
        }
        setEstimates([]);
      }
    } catch (error) {
      console.error('Load estimates error:', error);
      Alert.alert('Error', `Failed to load estimates: ${error.message}`);
      setEstimates([]);
    } finally {
      setIsLoadingEstimates(false);
    }
  };

  const handleEstimatesPress = () => {
    if (!canManage()) { Alert.alert('Manager access required', 'Ask your manager to make this change.'); return; }
    loadEstimates();
    setShowEstimatesModal(true);
  };

  // Create new estimate
  const createEstimate = async () => {
    if (!estimateData.customerName || !estimateData.serviceType || !estimateData.scopeOfWork) {
      Alert.alert('Required Fields', 'Please fill in customer name, service type, and scope of work.');
      return;
    }

    try {
      const result = await EstimateService.addEstimate(estimateData);
      if (result.success) {
        Alert.alert('Success', 'Estimate created successfully!');
        setShowCreateEstimateModal(false);
        setEstimateData({
          customerName: '',
          serviceType: '',
          scopeOfWork: '',
          materials: '',
          laborHours: '',
          laborRate: '',
          materialCost: '',
          totalCost: '',
          notes: ''
        });
        loadEstimates(); // Refresh the list
      } else {
        Alert.alert('Error', result.error.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create estimate');
    }
  };

  // Convert estimate to job
  const convertEstimateToJob = (estimate) => {
    Alert.alert(
      'Convert to Job',
      'This will create a new job from this estimate. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Convert', 
          onPress: () => {
            // TODO: Implement conversion logic
            Alert.alert('Success', 'Estimate converted to job successfully!');
          }
        }
      ]
    );
  };

  // Estimate templates
  const estimateTemplates = {
    'Pool Maintenance': {
      serviceType: 'Pool Maintenance',
      scopeOfWork: 'Weekly pool maintenance including:\n• Water testing and chemical balancing\n• Skimming and vacuuming\n• Filter cleaning and backwashing\n• Equipment inspection\n• Pool and deck cleaning',
      materials: 'Pool chemicals (chlorine, pH adjusters, algaecide), test strips, cleaning supplies',
      laborHours: '2',
      laborRate: '75',
      materialCost: '25',
      totalCost: '175',
      notes: 'Service includes weekly visits. Additional charges for equipment repairs or major cleaning.'
    },
    'Pest Control': {
      serviceType: 'Pest Control Treatment',
      scopeOfWork: 'Comprehensive pest control treatment including:\n• Interior and exterior inspection\n• Targeted treatment for identified pests\n• Preventive barrier treatment\n• Follow-up inspection and retreat if needed',
      materials: 'EPA-approved pesticides, bait stations, spray equipment, protective gear',
      laborHours: '1.5',
      laborRate: '85',
      materialCost: '45',
      totalCost: '172.50',
      notes: 'Treatment includes 30-day warranty. Follow-up visits available for additional fee.'
    },
    'General Handyman': {
      serviceType: 'General Handyman Services',
      scopeOfWork: 'Various repair and maintenance tasks including:\n• Minor plumbing repairs\n• Electrical fixture installation\n• Drywall patching and painting\n• Door and window adjustments\n• Furniture assembly',
      materials: 'Basic hardware, electrical components, plumbing parts, paint supplies',
      laborHours: '3',
      laborRate: '65',
      materialCost: '50',
      totalCost: '245',
      notes: 'Rate includes travel time. Additional materials will be quoted separately.'
    },
    'HVAC Service': {
      serviceType: 'HVAC Maintenance',
      scopeOfWork: 'HVAC system maintenance including:\n• Filter replacement\n• System cleaning and inspection\n• Thermostat calibration\n• Ductwork inspection\n• Performance testing',
      materials: 'Air filters, cleaning supplies, thermostat batteries, refrigerant (if needed)',
      laborHours: '2.5',
      laborRate: '90',
      materialCost: '75',
      totalCost: '300',
      notes: 'Service includes system performance report. Major repairs quoted separately.'
    }
  };

  // Apply template to estimate form
  const applyTemplate = (templateKey) => {
    const template = estimateTemplates[templateKey];
    if (template) {
      setEstimateData({
        ...estimateData,
        serviceType: template.serviceType,
        scopeOfWork: template.scopeOfWork,
        materials: template.materials,
        laborHours: template.laborHours,
        laborRate: template.laborRate,
        materialCost: template.materialCost,
        totalCost: template.totalCost,
        notes: template.notes
      });
      setShowTemplateModal(false);
    }
  };

  // Generate PDF for estimate
  const generatePDF = (estimate) => {
    Alert.alert(
      'Generate PDF',
      'PDF generation functionality will be implemented with a professional PDF library. This will create a formatted estimate document that can be shared with customers.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Generate', 
          onPress: () => {
            // TODO: Implement PDF generation with react-native-pdf-lib or similar
            Alert.alert('Success', 'PDF generation feature coming soon! This will create a professional estimate document.');
          }
        }
      ]
    );
  };

  // Show completion confirmation
  const showCompletionConfirmation = () => {
    if (!actualWorkDone) {
      Alert.alert('Required Field', 'Please describe the work that was done.');
      return;
    }
    if (actualHours.trim() && (!Number.isFinite(Number(actualHours)) || Number(actualHours) < 0 || Number(actualHours) > 744)) {
      Alert.alert('Work hours', 'Enter valid actual work hours, or leave this optional field empty.');
      return;
    }
    setShowCompletionConfirmModal(true);
  };

  // Complete job with actual work details
  const completeJob = async () => {
    if (!selectedJob) return;

    setShowCompletionConfirmModal(false);

    try {
      const completionData = {
        status: 'completed',
        actualWorkDone,
        ...(actualHours.trim() ? { actualHours: Number(actualHours) } : {}),
        completionNotes,
        completedAt: new Date().toISOString(),
      };

      const result = await JobService.updateJob(selectedJob.id, completionData);

      if (result.success) {
        Alert.alert('Saved', result.queued ? 'Completion saved on this device. Check sync status before leaving this job.' : 'Job completed successfully!');
        setShowJobCompletionModal(false);
        setShowJobDetailsModal(false);
        // Reload jobs to show updated status
        loadJobs();
      } else {
        Alert.alert('Error', result.error?.message || 'Failed to complete job');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to complete job');
    }
  };

  // Schedule follow-up appointment
  const scheduleFollowUp = () => {
    if (!canManage()) { Alert.alert('Manager access required', 'Ask your manager to make this change.'); return; }
    if (!selectedJob) return;

    // Pre-populate the schedule service form with customer info
    setSelectedCustomer(selectedJob.customerName);
    setSelectedService(selectedJob.serviceType);
    setNotes(`Follow-up for job completed on ${new Date().toLocaleDateString()}`);

    setShowJobDetailsModal(false);
    setShowJobCompletionModal(false);
    setShowScheduleServiceModal(true);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      // Silent error handling for sign out
    }
  };

  return (
    <GlassScreen><View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 22, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton icon="menu-outline" label="Open menu" onPress={() => setShowMenuModal(true)} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: palette.secondary, fontSize: 11, letterSpacing: 1.2, fontWeight: '700' }}>ROUTE LOGISTICS</Text>
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 19, fontWeight: '700' }}>{user.companyName || user.businessName || 'My workspace'}</Text>
        </View>
        <IconButton icon="settings-outline" label="Open settings" onPress={() => navigation.navigate('settings')} />
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={isLoadingJobs} onRefresh={loadJobs} tintColor={palette.accent} colors={[palette.accent]} />} contentContainerStyle={{ padding: 22, paddingTop: 12, gap: 18, paddingBottom: 30, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <View style={{ gap: 6 }}><Text style={{ color: palette.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.6 }}>{t('welcome')}, {user.name?.split(' ')[0]}.</Text><Text style={{ color: palette.secondary, fontSize: 14, textTransform: 'capitalize' }}>{user.role || 'Independent business'} · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</Text></View>
        <GlassCard>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 5 }}><Text style={{ color: palette.secondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{permissions.isTechnician ? 'My Work' : 'Your schedule'}</Text><Text style={{ color: palette.text, fontSize: 23, fontWeight: '700' }}>{isLoadingJobs ? 'Loading…' : jobs.length + (jobs.length === 1 ? ' job' : ' jobs')}</Text></View>
            <GlassButton secondary title="View schedule" icon="calendar-outline" onPress={handleSchedulePress} />
          </View>
          {!!jobsError && <Text accessibilityRole="alert" style={{ color: palette.danger }}>{jobsError}</Text>}
          {!isLoadingJobs && !jobsError && !jobs.length && <Text style={{ color: palette.secondary, lineHeight: 22 }}>{permissions.isTechnician ? 'No jobs assigned for this period. Your manager assigns your work.' : 'No jobs scheduled for this period.'}</Text>}
          {jobs.slice(0, 4).map(job => <TouchableOpacity key={job.id} accessibilityRole="button" onPress={() => handleJobSelection(job)} style={{ borderTopWidth: 1, borderColor: palette.border, paddingTop: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: palette.input, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={job.status === 'completed' ? 'checkmark-outline' : 'briefcase-outline'} size={21} color={palette.accent} /></View>
            <View style={{ flex: 1, gap: 4 }}><Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>{job.customerName || job.serviceType || 'Scheduled job'}</Text><Text style={{ color: palette.secondary, fontSize: 12 }}>{[job.time, job.serviceType, job.status].filter(Boolean).join(' · ')}</Text></View><Ionicons name="chevron-forward" size={17} color={palette.secondary} />
          </TouchableOpacity>)}
          <GlassButton secondary title="Refresh jobs" icon="refresh-outline" disabled={isLoadingJobs} onPress={loadJobs} />
          <GlassButton secondary title="Refresh workspace" icon="sync-outline" onPress={async () => { const result = await refreshUser(); if (result.success) loadJobs(); }} />
        </GlassCard>
        {managing && <View style={{ gap: 10 }}><Text style={{ color: palette.text, fontSize: 18, fontWeight: '700' }}>Manage work</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><GlassButton title="Schedule service" icon="add-outline" onPress={handleScheduleServicePress} style={{ flexGrow: 1 }} /><GlassButton secondary title="Customers" icon="people-outline" onPress={() => setShowCustomerModal(true)} style={{ flexGrow: 1 }} /><GlassButton secondary title="Estimates" icon="document-text-outline" onPress={handleEstimatesPress} style={{ flexGrow: 1 }} /></View></View>}
        <WorkLocation jobs={jobs} />
        <OfflineStatus onSynced={() => loadJobs()} />
        {permissions.isTechnician && <MyRoute />}
        <GlassCard><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Ionicons name="construct-outline" size={22} color={palette.accent} /><Text style={{ color: palette.text, fontSize: 18, fontWeight: '700', flex: 1 }}>{user.companyId ? 'Company services' : 'Your services'}</Text><Text style={{ color: palette.accent, fontWeight: '700' }}>{user.services?.length || 0}</Text></View>
          {user.services?.length ? user.services.slice(0, 6).map(service => <Text key={service} style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{service}</Text>) : <Text style={{ color: palette.secondary }}>{user.companyId ? 'Your company owner manages the service catalog.' : 'Add your business services in Settings.'}</Text>}
          <GlassButton secondary title="Business details & all services" icon="arrow-forward-outline" onPress={() => navigation.navigate('settings')} />
        </GlassCard>
      </ScrollView>

      {/* Custom Menu Modal with Green Buttons */}
      <Modal
        visible={showMenuModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMenuModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t('miFactotum')}</Text>
            <Text style={styles.modalSubtitle}>Choose an option</Text>

            {managing && (
            <TouchableOpacity 
              style={styles.modalButton}
              onPress={() => {
                setShowMenuModal(false);
                setShowCustomerModal(true);
              }}
            >
                <Text style={styles.modalButtonText}>{t('customers')}</Text>
            </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={styles.modalButton}
              onPress={() => {
                setShowMenuModal(false);
                handleSignOut();
              }}
            >
                <Text style={styles.modalButtonText}>{t('signOut')}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.modalButton, styles.modalCancelButton]}
              onPress={() => setShowMenuModal(false)}
            >
              <Text style={[styles.modalButtonText, styles.modalCancelText]}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Customer Management Modal */}
      <Modal
        visible={showCustomerModal && managing}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCustomerModal(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Customers</Text>
              <TouchableOpacity 
                onPress={() => setShowCustomerModal(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <MaterialIcons name="search" size={20} color={COLORS.gray[500]} style={styles.searchIcon} />
              <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                style={styles.searchInput}
                placeholder="Search customers..."
                placeholderTextColor={COLORS.gray[500]}
              />
            </View>

            <ScrollView style={styles.customerList}>
              {isLoadingCustomers ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="refresh" size={48} color={COLORS.primary[500]} />
                  <Text style={styles.emptyStateText}>Loading customers...</Text>
                </View>
              ) : customers.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="people" size={48} color={COLORS.gray[400]} />
                  <Text style={styles.emptyStateText}>No customers yet</Text>
                  <Text style={styles.emptyStateSubtext}>Add your first customer below</Text>
                </View>
              ) : (
                customers.map((customer) => (
                  <View key={customer.id} style={styles.customerItem}>
                    <View style={styles.customerInfo}>
                      <Text style={styles.customerName}>{customer.name}</Text>
                      <Text style={styles.customerDetails}>{customer.address} • {customer.phone}</Text>
                    </View>
                    <View style={styles.customerActions}>
                      <TouchableOpacity style={styles.actionIcon}>
                        <MaterialIcons name="edit" size={20} color={COLORS.primary[500]} />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.actionIcon}
                        onPress={() => {
                          Alert.alert(
                            'Delete Customer',
                            `Are you sure you want to delete ${customer.name}?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { 
                                text: 'Delete', 
                                style: 'destructive',
                                onPress: async () => {
                                  await deleteCustomerFromFirebase(customer.id);
                                }
                              }
                            ]
                          );
                        }}
                      >
                        <MaterialIcons name="delete" size={20} color={COLORS.red[500]} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.customerForm}>
              <Text style={styles.formSectionTitle}>Add New Customer</Text>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Name *</Text>
                <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                  style={styles.textInput}
                  placeholder="Customer Name"
                  value={customerName}
                  onChangeText={setCustomerName}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Phone *</Text>
                <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                  style={styles.textInput}
                  placeholder="(555) 123-4567"
                  keyboardType="phone-pad"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Address *</Text>
                <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                  style={[styles.textInput, styles.textArea]}
                  placeholder="123 Main St, City, State 12345"
                  multiline
                  numberOfLines={2}
                  value={customerAddress}
                  onChangeText={setCustomerAddress}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Email (optional)</Text>
                <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                  style={styles.textInput}
                  placeholder="customer@email.com"
                  keyboardType="email-address"
                  value={customerEmail}
                  onChangeText={setCustomerEmail}
                />
              </View>
            </View>

            <TouchableOpacity 
              style={[
                styles.addButton,
                !isCustomerFormValid() && styles.disabledButton
              ]}
              onPress={async () => {
                if (isCustomerFormValid()) {
                  const customerData = {
                    name: customerName,
                    phone: customerPhone,
                    address: customerAddress,
                    email: customerEmail || ''
                  };

                  const success = await addCustomerToFirebase(customerData);
                  if (success) {
                    Alert.alert('Success', 'Customer added successfully!');
                    resetCustomerForm();
                  }
                }
              }}
              disabled={!isCustomerFormValid()}
            >
              <MaterialIcons name="add" size={24} color={COLORS.white} />
              <Text style={[
                styles.addButtonText,
                !isCustomerFormValid() && styles.disabledButtonText
              ]}>
                Add Customer
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Schedule Service Modal */}
      <Modal
        visible={showScheduleServiceModal && managing}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowScheduleServiceModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.bottomModalOverlay}>
            <View style={styles.bottomModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('scheduleServiceTitle')}</Text>
                <TouchableOpacity 
                  onPress={() => setShowScheduleServiceModal(false)}
                  style={styles.closeButton}
                >
                  <MaterialIcons name="close" size={24} color={COLORS.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView 
                style={styles.scheduleForm}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="handled"
              >
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('customer')} *</Text>
                <TouchableOpacity 
                  style={styles.customerSelector}
                  onPress={() => setShowCustomerDropdown(!showCustomerDropdown)}
                >
                  <Text style={[styles.customerSelectorText, selectedCustomer && styles.selectedText]}>
                    {selectedCustomer || t('selectCustomer')}
                  </Text>
                  <MaterialIcons 
                    name={showCustomerDropdown ? "arrow-drop-up" : "arrow-drop-down"} 
                    size={24} 
                    color={COLORS.gray[500]} 
                  />
                </TouchableOpacity>

                {showCustomerDropdown && (
                  <View style={styles.dropdown}>
                    {customers.length === 0 ? (
                      <View style={styles.dropdownItem}>
                        <Text style={styles.dropdownItemText}>{t('noCustomersAvailable')}</Text>
                      </View>
                    ) : (
                      customers.map((customer) => (
                        <TouchableOpacity
                          key={customer.id}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setSelectedCustomer(customer.name);
                            setShowCustomerDropdown(false);
                          }}
                        >
                          <Text style={styles.dropdownItemText}>{customer.name}</Text>
                          <Text style={styles.dropdownItemSubtext}>{customer.address}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('serviceType')} *</Text>
                <TouchableOpacity 
                  style={styles.serviceSelector}
                  onPress={() => setShowServiceDropdown(!showServiceDropdown)}
                >
                  <Text style={[styles.serviceSelectorText, selectedService && styles.selectedText]}>
                    {selectedService || t('selectService')}
                  </Text>
                  <MaterialIcons 
                    name={showServiceDropdown ? "arrow-drop-up" : "arrow-drop-down"} 
                    size={24} 
                    color={COLORS.gray[500]} 
                  />
                </TouchableOpacity>

                {showServiceDropdown && (
                  <ScrollView 
                    style={styles.dropdown}
                    nestedScrollEnabled={true}
                    keyboardShouldPersistTaps="handled"
                  >
                    {!user?.services || user.services.length === 0 ? (
                      <View style={styles.dropdownItem}>
                        <Text style={styles.dropdownItemText}>{t('noServicesAvailable')}</Text>
                      </View>
                    ) : (
                      user.services.map((service, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setSelectedService(service);
                            setShowServiceDropdown(false);
                          }}
                        >
                          <Text style={styles.dropdownItemText}>{service}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                )}
              </View>

              <View style={styles.formRow}>
                <View style={styles.formGroupHalf}>
                  <Text style={styles.formLabel}>{t('date')} *</Text>
                  <TouchableOpacity style={styles.dateSelector} onPress={openDatePicker}>
                    <MaterialIcons name="calendar-today" size={20} color={COLORS.primary[500]} />
                    <Text style={[styles.dateSelectorText, selectedDate && styles.selectedText]}>
                      {selectedDate || t('selectDate')}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.formGroupHalf}>
                  <Text style={styles.formLabel}>{t('time')} *</Text>
                  <TouchableOpacity style={styles.timeSelector} onPress={openTimePicker}>
                    <MaterialIcons name="access-time" size={20} color={COLORS.primary[500]} />
                    <Text style={[styles.timeSelectorText, selectedTime && styles.selectedText]}>
                      {selectedTime || t('selectTime')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('expectedDuration')} *</Text>
                <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                  style={styles.textInput}
                  placeholder="2"
                  keyboardType="numeric"
                  value={duration}
                  onChangeText={setDuration}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('estimatedCost')}</Text>
                <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                  style={styles.textInput}
                  placeholder="$150"
                  keyboardType="numeric"
                  value={estimatedCost}
                  onChangeText={setEstimatedCost}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('notes')}</Text>
                <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Additional notes..."
                  multiline
                  numberOfLines={3}
                  value={notes}
                  onChangeText={setNotes}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  resetScheduleForm();
                  setShowScheduleServiceModal(false);
                }}
              >
                <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.modalButton, 
                  styles.confirmButton,
                  !isScheduleFormValid() && styles.disabledButton
                ]}
                onPress={async () => {
                  if (isScheduleFormValid()) {
                    try {
                      const jobData = {
                        customerName: selectedCustomer,
                        serviceType: selectedService,
                        date: selectedDate,
                        time: selectedTime,
                        duration: duration,
                        estimatedCost: estimatedCost || null,
                        notes: notes || '',
                      };

                      const result = await JobService.addJob(jobData);

                      if (result.success) {
                        Alert.alert('Success', 'Service scheduled successfully!');
                        resetScheduleForm();
                        setShowScheduleServiceModal(false);
                        // Reload jobs to show the new one
                        loadJobs();
                      } else {
                        Alert.alert('Error', result.error?.message || 'Failed to schedule service');
                      }
                    } catch (error) {
                      console.error('Schedule service error:', error);
                      Alert.alert('Error', 'Failed to schedule service');
                    }
                  }
                }}
                disabled={!isScheduleFormValid()}
              >
                <Text style={[
                  styles.confirmButtonText,
                  !isScheduleFormValid() && styles.disabledButtonText
                ]}>
                  {t('scheduleServiceButton')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Schedule List Modal */}
      <Modal
        visible={showScheduleModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowScheduleModal(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule</Text>
              <TouchableOpacity 
                onPress={() => setShowScheduleModal(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.filterContainer}>
              <TouchableOpacity 
                style={[styles.filterButton, activeFilter === 'day' && styles.activeFilterButton]}
                onPress={() => setActiveFilter('day')}
              >
                <Text style={[styles.filterButtonText, activeFilter === 'day' && styles.activeFilterButtonText]}>
                  {t('day')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.filterButton, activeFilter === 'week' && styles.activeFilterButton]}
                onPress={() => setActiveFilter('week')}
              >
                <Text style={[styles.filterButtonText, activeFilter === 'week' && styles.activeFilterButtonText]}>
                  {t('week')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.filterButton, activeFilter === 'month' && styles.activeFilterButton]}
                onPress={() => setActiveFilter('month')}
              >
                <Text style={[styles.filterButtonText, activeFilter === 'month' && styles.activeFilterButtonText]}>
                  {t('month')}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scheduleList}>
              {isLoadingJobs ? (
                <View style={styles.emptyStateContainer}>
                  <MaterialIcons name="schedule" size={48} color={COLORS.gray[400]} />
                  <Text style={styles.emptyStateText}>Loading jobs...</Text>
                </View>
              ) : jobs.length === 0 ? (
                <View style={styles.emptyStateContainer}>
                  <MaterialIcons name="schedule" size={48} color={COLORS.gray[400]} />
                  <Text style={styles.emptyStateText}>No jobs scheduled</Text>
                  <Text style={styles.emptyStateSubtext}>
                    {activeFilter === 'day' && 'No jobs scheduled for today'}
                    {activeFilter === 'week' && 'No jobs scheduled for this week'}
                    {activeFilter === 'month' && 'No jobs scheduled for this month'}
                  </Text>
                </View>
              ) : (
                jobs.map((job) => (
                  <TouchableOpacity 
                    key={job.id} 
                    style={styles.scheduleItem}
                    onPress={() => handleJobSelection(job)}
                  >
                    <View style={styles.scheduleTime}>
                      <Text style={styles.scheduleTimeText}>{job.time}</Text>
                    </View>
                    <View style={styles.scheduleDetails}>
                      <Text style={styles.scheduleTitle}>{job.serviceType} - {job.customerName}</Text>
                      <Text style={styles.scheduleLocation}>{job.date}</Text>
                      <Text style={styles.scheduleDuration}>
                        {job.duration} hours
                        {job.estimatedCost && ` • $${job.estimatedCost}`}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.scheduleAction}>
                      <MaterialIcons name="more-vert" size={20} color={COLORS.gray[500]} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Job Details Modal */}
      <Modal
        visible={showJobDetailsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowJobDetailsModal(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Job Details</Text>
              <TouchableOpacity 
                onPress={() => setShowJobDetailsModal(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>

            {selectedJob && (
              <ScrollView style={styles.jobDetailsContent}>
                <FieldWorkTools job={selectedJob} onChanged={loadJobs} /><JobPhotos job={selectedJob} />
                <View style={styles.jobDetailRow}>
                  <Text style={styles.jobDetailLabel}>Customer:</Text>
                  <Text style={styles.jobDetailValue}>{selectedJob.customerName}</Text>
                </View>
                <View style={styles.jobDetailRow}>
                  <Text style={styles.jobDetailLabel}>Service:</Text>
                  <Text style={styles.jobDetailValue}>{selectedJob.serviceType}</Text>
                </View>
                <View style={styles.jobDetailRow}>
                  <Text style={styles.jobDetailLabel}>Date:</Text>
                  <Text style={styles.jobDetailValue}>{selectedJob.date}</Text>
                </View>
                <View style={styles.jobDetailRow}>
                  <Text style={styles.jobDetailLabel}>Time:</Text>
                  <Text style={styles.jobDetailValue}>{selectedJob.time}</Text>
                </View>
                <View style={styles.jobDetailRow}>
                  <Text style={styles.jobDetailLabel}>Duration:</Text>
                  <Text style={styles.jobDetailValue}>{selectedJob.duration} hours</Text>
                </View>
                {managing && selectedJob.estimatedCost && (
                  <View style={styles.jobDetailRow}>
                    <Text style={styles.jobDetailLabel}>Estimated Cost:</Text>
                    <Text style={styles.jobDetailValue}>${selectedJob.estimatedCost}</Text>
                  </View>
                )}
                {selectedJob.notes && (
                  <View style={styles.jobDetailRow}>
                    <Text style={styles.jobDetailLabel}>Notes:</Text>
                    <Text style={styles.jobDetailValue}>{selectedJob.notes}</Text>
                  </View>
                )}
                <View style={styles.jobDetailRow}>
                  <Text style={styles.jobDetailLabel}>Status:</Text>
                  <Text style={[styles.jobDetailValue, styles.statusText]}>
                    {selectedJob.status || 'Scheduled'}
                  </Text>
                </View>

                {selectedJob.status === 'completed' && (
                  <>
                    {selectedJob.actualWorkDone && (
                      <View style={styles.jobDetailRow}>
                        <Text style={styles.jobDetailLabel}>Work Done:</Text>
                        <Text style={styles.jobDetailValue}>{selectedJob.actualWorkDone}</Text>
                      </View>
                    )}
                    {selectedJob.actualHours && (
                      <View style={styles.jobDetailRow}>
                        <Text style={styles.jobDetailLabel}>Actual Hours:</Text>
                        <Text style={styles.jobDetailValue}>{selectedJob.actualHours} hours</Text>
                      </View>
                    )}
                    {selectedJob.completedAt && (
                      <View style={styles.jobDetailRow}>
                        <Text style={styles.jobDetailLabel}>Completed:</Text>
                        <Text style={styles.jobDetailValue}>
                          {new Date(selectedJob.completedAt).toLocaleDateString()}
                        </Text>
                      </View>
                    )}
                    {selectedJob.completionNotes && (
                      <View style={styles.jobDetailRow}>
                        <Text style={styles.jobDetailLabel}>Completion Notes:</Text>
                        <Text style={styles.jobDetailValue}>{selectedJob.completionNotes}</Text>
                      </View>
                    )}
                    {selectedJob.photos && selectedJob.photos.length > 0 && (
                      <View style={styles.jobDetailRow}>
                        <Text style={styles.jobDetailLabel}>Photos:</Text>
                        <Text style={styles.jobDetailValue}>{selectedJob.photos.length} photos</Text>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowJobDetailsModal(false)}
              >
                <Text style={styles.cancelButtonText}>Close</Text>
              </TouchableOpacity>

              {selectedJob?.status === 'scheduled' && <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={async () => { const result = await JobService.updateJob(selectedJob.id, { status: 'in-progress' }); if (result.success) { setSelectedJob({ ...selectedJob, status: 'in-progress' }); loadJobs(); } else Alert.alert('Could not start job', result.error?.message || 'Try again.'); }}><Text style={styles.confirmButtonText}>Start</Text></TouchableOpacity>}
              {['scheduled', 'en-route', 'in-progress'].includes(selectedJob?.status) && (
                <>
                  {managing && <TouchableOpacity
                    style={[styles.modalButton, styles.editButton]}
                    disabled={!canManage()}
                    onPress={() => handleJobEdit(selectedJob)}
                  >
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>}
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.confirmButton]}
                    onPress={() => handleJobCompletion(selectedJob)}
                  >
                    <Text style={styles.confirmButtonText}>Complete</Text>
                  </TouchableOpacity>
                </>
              )}

              {canManage() && selectedJob?.status === 'completed' && (
                <TouchableOpacity 
                  style={[styles.modalButton, styles.followUpButton]}
                  onPress={scheduleFollowUp}
                >
                  <Text style={styles.followUpButtonText}>Schedule Follow-up</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Job Completion Modal */}
      <Modal
        visible={showJobCompletionModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowJobCompletionModal(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Complete</Text>
              <TouchableOpacity 
                onPress={() => setShowJobCompletionModal(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.completionForm}>
              <JobPhotos job={selectedJob} />
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>What work was actually done? *</Text>
                <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Describe the work completed..."
                  multiline
                  numberOfLines={4}
                  value={actualWorkDone}
                  onChangeText={setActualWorkDone}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Actual hours worked</Text>
                <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                  style={styles.textInput}
                  placeholder="2.5"
                  keyboardType="numeric"
                  value={actualHours}
                  onChangeText={setActualHours}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Completion notes</Text>
                <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Any additional notes about the completion..."
                  multiline
                  numberOfLines={3}
                  value={completionNotes}
                  onChangeText={setCompletionNotes}
                />
              </View>

            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowJobCompletionModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.modalButton, 
                  styles.confirmButton,
                  !actualWorkDone && styles.disabledButton
                ]}
                onPress={showCompletionConfirmation}
                disabled={!actualWorkDone}
              >
                <Text style={[
                  styles.confirmButtonText,
                  !actualWorkDone && styles.disabledButtonText
                ]}>
                  Complete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Completion Confirmation Modal */}
      <Modal
        visible={showCompletionConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCompletionConfirmModal(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <MaterialIcons name="check-circle" size={48} color={COLORS.primary[500]} />
            <Text style={styles.confirmModalTitle}>Complete This Job?</Text>
            <Text style={styles.confirmModalMessage}>
              This will mark the job as completed and update the job status. This action cannot be undone.
            </Text>

            <View style={styles.confirmModalActions}>
              <TouchableOpacity 
                style={[styles.confirmModalButton, styles.confirmModalCancelButton]}
                onPress={() => setShowCompletionConfirmModal(false)}
              >
                <Text style={styles.confirmModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.confirmModalButton, styles.confirmModalConfirmButton]}
                onPress={completeJob}
              >
                <Text style={styles.confirmModalConfirmText}>Yes, Complete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal for iOS */}
      {Platform.OS === 'ios' && showDatePicker && (
        <Modal
          visible={showDatePicker}
          transparent={true}
          animationType="slide"
          onRequestClose={closeDatePicker}
        >
          <View style={styles.pickerModalOverlay}>
            <View style={styles.pickerModalContent}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={closeDatePicker}>
                  <Text style={styles.pickerDoneButton}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker themeVariant={isDark ? 'dark' : 'light'}
                value={selectedDateTime}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                minimumDate={new Date()}
                style={styles.iosDatePicker}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Date Picker for Android */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker themeVariant={isDark ? 'dark' : 'light'}
          value={selectedDateTime}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}

      {/* Time Picker Modal for iOS */}
      {Platform.OS === 'ios' && showTimePicker && (
        <Modal
          visible={showTimePicker}
          transparent={true}
          animationType="slide"
          onRequestClose={closeTimePicker}
        >
          <View style={styles.pickerModalOverlay}>
            <View style={styles.pickerModalContent}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={closeTimePicker}>
                  <Text style={styles.pickerDoneButton}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker themeVariant={isDark ? 'dark' : 'light'}
                value={selectedDateTime}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
                style={styles.iosDatePicker}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Time Picker for Android */}
      {Platform.OS === 'android' && showTimePicker && (
        <DateTimePicker themeVariant={isDark ? 'dark' : 'light'}
          value={selectedDateTime}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}

      {/* Job Edit Modal */}
      <Modal
        visible={showJobEditModal && managing}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowJobEditModal(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Job</Text>
              <TouchableOpacity 
                onPress={() => setShowJobEditModal(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>

            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.editForm}
            >
              <ScrollView style={styles.editFormContent}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Customer Name *</Text>
                  <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                    style={styles.textInput}
                    placeholder="Enter customer name"
                    value={editJobData.customerName}
                    onChangeText={(text) => setEditJobData({...editJobData, customerName: text})}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Service Type *</Text>
                  <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                    style={styles.textInput}
                    placeholder="Enter service type"
                    value={editJobData.serviceType}
                    onChangeText={(text) => setEditJobData({...editJobData, serviceType: text})}
                  />
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.formLabel}>Date *</Text>
                    <TouchableOpacity 
                      style={styles.dateTimeButton}
                      onPress={openDatePicker}
                    >
                      <Text style={styles.dateTimeButtonText}>
                        {editJobData.date || 'Select Date'}
                      </Text>
                      <MaterialIcons name="calendar-today" size={20} color={COLORS.primary[500]} />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.formLabel}>Time *</Text>
                    <TouchableOpacity 
                      style={styles.dateTimeButton}
                      onPress={openTimePicker}
                    >
                      <Text style={styles.dateTimeButtonText}>
                        {editJobData.time || 'Select Time'}
                      </Text>
                      <MaterialIcons name="access-time" size={20} color={COLORS.primary[500]} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.formLabel}>Duration (hours)</Text>
                    <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                      style={styles.textInput}
                      placeholder="2.5"
                      keyboardType="numeric"
                      value={editJobData.duration}
                      onChangeText={(text) => setEditJobData({...editJobData, duration: text})}
                    />
                  </View>

                  <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.formLabel}>Estimated Cost</Text>
                    <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                      style={styles.textInput}
                      placeholder="150.00"
                      keyboardType="numeric"
                      value={editJobData.estimatedCost}
                      onChangeText={(text) => setEditJobData({...editJobData, estimatedCost: text})}
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Status</Text>
                  <View style={styles.statusSelector}>
                    <TouchableOpacity 
                      style={[
                        styles.statusOption, 
                        editJobData.status === 'scheduled' && styles.statusOptionSelected
                      ]}
                      onPress={() => setEditJobData({...editJobData, status: 'scheduled'})}
                    >
                      <Text style={[
                        styles.statusOptionText,
                        editJobData.status === 'scheduled' && styles.statusOptionTextSelected
                      ]}>Scheduled</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[
                        styles.statusOption, 
                        editJobData.status === 'in-progress' && styles.statusOptionSelected
                      ]}
                      onPress={() => setEditJobData({...editJobData, status: 'in-progress'})}
                    >
                      <Text style={[
                        styles.statusOptionText,
                        editJobData.status === 'in-progress' && styles.statusOptionTextSelected
                      ]}>In Progress</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[
                        styles.statusOption, 
                        editJobData.status === 'completed' && styles.statusOptionSelected
                      ]}
                      onPress={() => setEditJobData({...editJobData, status: 'completed'})}
                    >
                      <Text style={[
                        styles.statusOptionText,
                        editJobData.status === 'completed' && styles.statusOptionTextSelected
                      ]}>Completed</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Notes</Text>
                  <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                    style={[styles.textInput, styles.textArea]}
                    placeholder="Additional notes..."
                    multiline
                    numberOfLines={3}
                    value={editJobData.notes}
                    onChangeText={(text) => setEditJobData({...editJobData, notes: text})}
                  />
                </View>

                <JobPhotos job={selectedJob} />
              </ScrollView>
            </KeyboardAvoidingView>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowJobEditModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.modalButton, 
                  styles.confirmButton,
                  (!editJobData.customerName || !editJobData.serviceType || !editJobData.date || !editJobData.time) && styles.disabledButton
                ]}
                onPress={saveEditedJob}
                disabled={!editJobData.customerName || !editJobData.serviceType || !editJobData.date || !editJobData.time || isEditingJob}
              >
                <Text style={[
                  styles.confirmButtonText,
                  (!editJobData.customerName || !editJobData.serviceType || !editJobData.date || !editJobData.time) && styles.disabledButtonText
                ]}>
                  {isEditingJob ? 'Saving...' : 'Save Changes'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Estimates List Modal */}
      <Modal
        visible={showEstimatesModal && managing}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEstimatesModal(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Estimates</Text>
              <TouchableOpacity 
                onPress={() => setShowEstimatesModal(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.estimatesActions}>
              <TouchableOpacity 
                style={styles.createEstimateButton}
                onPress={() => setShowCreateEstimateModal(true)}
              >
                <MaterialIcons name="add" size={20} color={COLORS.white} />
                <Text style={styles.createEstimateButtonText}>Create Estimate</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.estimatesList}>
              {isLoadingEstimates ? (
                <View style={styles.emptyStateContainer}>
                  <MaterialIcons name="description" size={48} color={COLORS.gray[400]} />
                  <Text style={styles.emptyStateText}>Loading estimates...</Text>
                </View>
              ) : estimates.length === 0 ? (
                <View style={styles.emptyStateContainer}>
                  <MaterialIcons name="description" size={48} color={COLORS.gray[400]} />
                  <Text style={styles.emptyStateText}>No estimates yet</Text>
                  <Text style={styles.emptyStateSubtext}>Create your first estimate to get started</Text>
                </View>
              ) : (
                estimates.map((estimate) => (
                  <View key={estimate.id} style={styles.estimateItem}>
                    <View style={styles.estimateHeader}>
                      <Text style={styles.estimateCustomer}>{estimate.customerName}</Text>
                      <View style={[styles.statusBadge, styles[`status${estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1)}`]]}>
                        <Text style={styles.statusText}>{estimate.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.estimateService}>{estimate.serviceType}</Text>
                    <Text style={styles.estimateNumber}>#{estimate.estimateNumber}</Text>
                    <Text style={styles.estimateCost}>${estimate.totalCost}</Text>
                    <Text style={styles.estimateDate}>
                      Created: {new Date(estimate.createdAt).toLocaleDateString()}
                    </Text>
                    {estimate.validUntil && (
                      <Text style={styles.estimateValidUntil}>
                        Valid until: {new Date(estimate.validUntil).toLocaleDateString()}
                      </Text>
                    )}

                    <View style={styles.estimateActions}>
                      <TouchableOpacity 
                        style={[styles.estimateActionButton, styles.secondaryButton]}
                        onPress={() => generatePDF(estimate)}
                      >
                        <Text style={styles.secondaryButtonText}>Generate PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.estimateActionButton}
                        onPress={() => convertEstimateToJob(estimate)}
                      >
                        <Text style={styles.estimateActionText}>Convert to Job</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Create Estimate Modal */}
      <Modal
        visible={showCreateEstimateModal && managing}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateEstimateModal(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Estimate</Text>
              <View style={styles.modalHeaderActions}>
                <TouchableOpacity 
                  style={styles.clearButton}
                  onPress={() => {
                    setEstimateData({
                      customerName: '',
                      serviceType: '',
                      scopeOfWork: '',
                      materials: '',
                      laborHours: '',
                      laborRate: '',
                      materialCost: '',
                      totalCost: '',
                      notes: ''
                    });
                  }}
                >
                  <MaterialIcons name="refresh" size={20} color={COLORS.primary[500]} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.templateButton}
                  onPress={() => setShowTemplateModal(true)}
                >
                  <MaterialIcons name="content-copy" size={20} color={COLORS.primary[500]} />
                  <Text style={styles.templateButtonText}>Template</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => setShowCreateEstimateModal(false)}
                  style={styles.closeButton}
                >
                  <MaterialIcons name="close" size={24} color={COLORS.text.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.estimateForm}
            >
              <ScrollView style={styles.estimateFormContent}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Customer *</Text>
                  <TouchableOpacity 
                    style={styles.customerSelector}
                    onPress={() => setShowCustomerDropdown(true)}
                  >
                    <Text style={styles.customerSelectorText}>
                      {estimateData.customerName || 'Select Customer'}
                    </Text>
                    <MaterialIcons name="arrow-drop-down" size={24} color={COLORS.text.secondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Service Type *</Text>
                  <TouchableOpacity 
                    style={styles.serviceSelector}
                    onPress={() => setShowServiceDropdown(true)}
                  >
                    <Text style={styles.serviceSelectorText}>
                      {estimateData.serviceType || 'Select Service Type'}
                    </Text>
                    <MaterialIcons name="arrow-drop-down" size={24} color={COLORS.text.secondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Scope of Work *</Text>
                  <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                    style={[styles.textInput, styles.textArea]}
                    placeholder="Describe the work to be performed..."
                    multiline
                    numberOfLines={4}
                    value={estimateData.scopeOfWork}
                    onChangeText={(text) => setEstimateData({...estimateData, scopeOfWork: text})}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Materials</Text>
                  <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                    style={[styles.textInput, styles.textArea]}
                    placeholder="List materials needed..."
                    multiline
                    numberOfLines={3}
                    value={estimateData.materials}
                    onChangeText={(text) => setEstimateData({...estimateData, materials: text})}
                  />
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.formLabel}>Labor Hours</Text>
                    <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                      style={styles.textInput}
                      placeholder="2.5"
                      keyboardType="numeric"
                      value={estimateData.laborHours}
                      onChangeText={(text) => setEstimateData({...estimateData, laborHours: text})}
                    />
                  </View>

                  <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.formLabel}>Labor Rate ($/hr)</Text>
                    <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                      style={styles.textInput}
                      placeholder="75.00"
                      keyboardType="numeric"
                      value={estimateData.laborRate}
                      onChangeText={(text) => setEstimateData({...estimateData, laborRate: text})}
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Material Cost</Text>
                  <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                    style={styles.textInput}
                    placeholder="150.00"
                    keyboardType="numeric"
                    value={estimateData.materialCost}
                    onChangeText={(text) => setEstimateData({...estimateData, materialCost: text})}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Total Cost</Text>
                  <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                    style={styles.textInput}
                    placeholder="300.00"
                    keyboardType="numeric"
                    value={estimateData.totalCost}
                    onChangeText={(text) => setEstimateData({...estimateData, totalCost: text})}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Notes</Text>
                  <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
                    style={[styles.textInput, styles.textArea]}
                    placeholder="Additional notes..."
                    multiline
                    numberOfLines={3}
                    value={estimateData.notes}
                    onChangeText={(text) => setEstimateData({...estimateData, notes: text})}
                  />
                </View>
              </ScrollView>
            </KeyboardAvoidingView>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowCreateEstimateModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.modalButton, 
                  styles.confirmButton,
                  (!estimateData.customerName || !estimateData.serviceType || !estimateData.scopeOfWork) && styles.disabledButton
                ]}
                onPress={createEstimate}
                disabled={!estimateData.customerName || !estimateData.serviceType || !estimateData.scopeOfWork}
              >
                <Text style={[
                  styles.confirmButtonText,
                  (!estimateData.customerName || !estimateData.serviceType || !estimateData.scopeOfWork) && styles.disabledButtonText
                ]}>
                  Create Estimate
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Template Selection Modal */}
      <Modal
        visible={showTemplateModal && managing}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTemplateModal(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Template</Text>
              <TouchableOpacity 
                onPress={() => setShowTemplateModal(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.templateList}>
              <Text style={styles.templateTitle}>Choose a Template:</Text>
              <Text style={styles.templateDescription}>Select a template to auto-fill the estimate form</Text>

              <TouchableOpacity 
                style={styles.templateItem}
                onPress={() => {
                  applyTemplate('Pool Maintenance');
                  setShowTemplateModal(false);
                }}
              >
                <View style={styles.templateHeader}>
                  <Text style={styles.templateTitle}>Pool Maintenance</Text>
                  <Text style={styles.templatePrice}>$175</Text>
                </View>
                <Text style={styles.templateDescription}>Weekly pool maintenance including water testing, cleaning, and equipment inspection</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.templateItem}
                onPress={() => {
                  applyTemplate('Pest Control');
                  setShowTemplateModal(false);
                }}
              >
                <View style={styles.templateHeader}>
                  <Text style={styles.templateTitle}>Pest Control Treatment</Text>
                  <Text style={styles.templatePrice}>$172.50</Text>
                </View>
                <Text style={styles.templateDescription}>Comprehensive pest control treatment with inspection and preventive barrier treatment</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.templateItem}
                onPress={() => {
                  applyTemplate('General Handyman');
                  setShowTemplateModal(false);
                }}
              >
                <View style={styles.templateHeader}>
                  <Text style={styles.templateTitle}>General Handyman</Text>
                  <Text style={styles.templatePrice}>$245</Text>
                </View>
                <Text style={styles.templateDescription}>Various repair and maintenance tasks including plumbing, electrical, and painting</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.templateItem}
                onPress={() => {
                  applyTemplate('HVAC Service');
                  setShowTemplateModal(false);
                }}
              >
                <View style={styles.templateHeader}>
                  <Text style={styles.templateTitle}>HVAC Maintenance</Text>
                  <Text style={styles.templatePrice}>$300</Text>
                </View>
                <Text style={styles.templateDescription}>HVAC system maintenance including filter replacement, cleaning, and performance testing</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Customer Selection Modal */}
      <Modal
        visible={showCustomerDropdown}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCustomerDropdown(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Customer</Text>
              <TouchableOpacity 
                onPress={() => setShowCustomerDropdown(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.customerList}>
              {customers.length === 0 ? (
                <View style={styles.emptyStateContainer}>
                  <MaterialIcons name="person" size={48} color={COLORS.gray[400]} />
                  <Text style={styles.emptyStateText}>No customers yet</Text>
                  <Text style={styles.emptyStateSubtext}>Add your first customer to get started</Text>
                </View>
              ) : (
                customers.map((customer) => (
                  <TouchableOpacity
                    key={customer.id}
                    style={styles.customerItem}
                    onPress={() => {
                      setEstimateData({...estimateData, customerName: customer.name});
                      setShowCustomerDropdown(false);
                    }}
                  >
                    <View style={styles.customerInfo}>
                      <Text style={styles.customerName}>{customer.name}</Text>
                      <Text style={styles.customerDetails}>
                        {customer.phone} • {customer.address}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}

              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => {
                  setShowCustomerDropdown(false);
                  // TODO: Open add customer modal or navigate to customer management
                  Alert.alert('Add Customer', 'Add customer functionality will be implemented');
                }}
              >
                <MaterialIcons name="add" size={20} color={COLORS.white} />
                <Text style={styles.addButtonText}>Add New Customer</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Service Type Selection Modal */}
      <Modal
        visible={showServiceDropdown}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowServiceDropdown(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Service Type</Text>
              <TouchableOpacity 
                onPress={() => setShowServiceDropdown(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.customerList}>
              {user?.services && user.services.length > 0 ? (
                user.services.map((service, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.customerItem}
                    onPress={() => {
                      setEstimateData({...estimateData, serviceType: service});
                      setShowServiceDropdown(false);
                    }}
                  >
                    <View style={styles.customerInfo}>
                      <Text style={styles.customerName}>{service}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyStateContainer}>
                  <MaterialIcons name="build" size={48} color={COLORS.gray[400]} />
                  <Text style={styles.emptyStateText}>No services configured</Text>
                  <Text style={styles.emptyStateSubtext}>Update your services in Settings</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View></GlassScreen>
  );
};

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.secondary,
  },
  headerContainer: {
    backgroundColor: COLORS.primary[500],
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: hp('6%'),
    paddingBottom: SPACING.LARGE,
    paddingHorizontal: SPACING.LARGE,
  },
  menuButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BORDER_RADIUS.full,
    padding: SPACING.SMALL,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BORDER_RADIUS.full,
    padding: SPACING.SMALL,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },
  logoText: {
    fontSize: Platform.OS === 'ios' ? FONT_SIZES.DISPLAY * 0.7 : FONT_SIZES.DISPLAY * 0.8,
    fontWeight: 'bold',
    marginBottom: SPACING.SMALL,
  },
  factotumText: {
    color: COLORS.white,
  },
  welcomeText: {
    fontSize: Platform.OS === 'ios' ? FONT_SIZES.HEADING * 0.8 : FONT_SIZES.HEADING,
    color: COLORS.text.secondary,
  },
  servicesContainer: {
    padding: SPACING.LARGE,
  },
  sectionTitle: {
    fontSize: Platform.OS === 'ios' ? FONT_SIZES.LARGE * 0.6 : FONT_SIZES.LARGE * 0.8, // 40% reduction on iOS, 20% on Android
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: SPACING.MEDIUM,
  },
  serviceCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.background.secondary,
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: SPACING.MEDIUM,
    marginBottom: SPACING.MEDIUM,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  servicesList: {
    // No special styling needed for vertical list
  },
  noServicesContainer: {
    alignItems: 'center',
    padding: SPACING.LARGE,
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginBottom: SPACING.MEDIUM,
  },
  noServicesText: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.secondary,
    marginTop: SPACING.SMALL,
    textAlign: 'center',
  },
  noServicesSubtext: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.tertiary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  serviceIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.MEDIUM,
  },
  serviceContent: {
    flex: 1,
    justifyContent: 'center',
  },
  serviceTitle: {
    fontSize: Platform.OS === 'ios' ? FONT_SIZES.HEADING * 0.6 : FONT_SIZES.HEADING * 0.8, // 40% reduction on iOS, 20% on Android
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: SPACING.TINY,
  },
  serviceDescription: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.tertiary,
  },
  actionsContainer: {
    backgroundColor: COLORS.background.secondary,
    padding: SPACING.LARGE,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[200],
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: '48%',
    backgroundColor: COLORS.primary[50],
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: SPACING.MEDIUM,
    alignItems: 'center',
    marginBottom: SPACING.MEDIUM,
    borderWidth: 1,
    borderColor: COLORS.primary[200],
  },
  actionButtonText: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.primary[700],
    marginTop: SPACING.TINY,
    textAlign: 'center',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.background.secondary,
    borderRadius: BORDER_RADIUS.LARGE,
    padding: SPACING.LARGE,
    width: wp('80%'),
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: FONT_SIZES.HEADING,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: SPACING.SMALL,
  },
  modalSubtitle: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: SPACING.LARGE,
  },
  modalButton: {
    backgroundColor: COLORS.primary[500],
    paddingVertical: SPACING.SMALL,
    paddingHorizontal: SPACING.SMALL,
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginBottom: SPACING.SMALL,
  },
  modalButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalCancelButton: {
    backgroundColor: COLORS.gray[100],
  },
  modalCancelText: {
    color: COLORS.text.secondary,
  },
  // Bottom Modal Styles
  bottomModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomModalContent: {
    backgroundColor: COLORS.background.secondary,
    borderTopLeftRadius: BORDER_RADIUS.LARGE,
    borderTopRightRadius: BORDER_RADIUS.LARGE,
    height: hp('90%'),
    paddingBottom: SPACING.LARGE,
  },
  templateModalContent: {
    backgroundColor: COLORS.background.secondary,
    borderTopLeftRadius: BORDER_RADIUS.LARGE,
    borderTopRightRadius: BORDER_RADIUS.LARGE,
    maxHeight: hp('85%'),
    paddingBottom: SPACING.LARGE,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.LARGE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[200],
  },
  closeButton: {
    padding: SPACING.SMALL,
  },
  // Customer Modal Styles
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.MEDIUM,
    margin: SPACING.LARGE,
    marginBottom: SPACING.MEDIUM,
    paddingHorizontal: SPACING.MEDIUM,
  },
  searchIcon: {
    marginRight: SPACING.SMALL,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.MEDIUM,
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.primary,
  },
  customerList: {
    maxHeight: hp('40%'),
    paddingHorizontal: SPACING.LARGE,
  },
  customerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.MEDIUM,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[100],
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.TINY,
  },
  customerDetails: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.secondary,
  },
  customerActions: {
    flexDirection: 'row',
    gap: SPACING.SMALL,
  },
  actionIcon: {
    padding: SPACING.SMALL,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary[500],
    margin: SPACING.LARGE,
    paddingVertical: SPACING.MEDIUM,
    borderRadius: BORDER_RADIUS.MEDIUM,
    gap: SPACING.SMALL,
  },
  addButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
  },
  customerForm: {
    padding: SPACING.LARGE,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[200],
  },
  formSectionTitle: {
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.MEDIUM,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.XLARGE,
  },


  // Schedule Service Modal Styles
  scheduleForm: {
    padding: SPACING.LARGE,
    maxHeight: hp('60%'),
  },
  formGroup: {
    marginBottom: SPACING.SMALL,
  },

  formGroupHalf: {
    flex: 1,
  },
  formLabel: {
    fontSize: FONT_SIZES.CAPTION,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.TINY,
  },



  customerSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: SPACING.MEDIUM,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
  },
  customerSelectorText: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.secondary,
  },
  serviceSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: SPACING.MEDIUM,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
  },
  serviceSelectorText: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.secondary,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: SPACING.MEDIUM,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    gap: SPACING.SMALL,
  },
  dateSelectorText: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.secondary,
  },
  timeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: SPACING.MEDIUM,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    gap: SPACING.SMALL,
  },
  timeSelectorText: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.secondary,
  },
  textInput: {
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: SPACING.MEDIUM,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.primary,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    padding: SPACING.LARGE,
    gap: SPACING.MEDIUM,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.red[400],
    // backgroundColor: COLORS.gray[100],
    paddingVertical: SPACING.MEDIUM,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  cancelButtonText: {
    color: COLORS.text.secondary,
    fontSize: FONT_SIZES.BODY,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: COLORS.primary[500],
    paddingVertical: SPACING.MEDIUM,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  confirmButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.BODY,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Schedule List Modal Styles
  filterContainer: {
    flexDirection: 'row',
    padding: SPACING.LARGE,
    gap: SPACING.SMALL,
  },
  filterButton: {
    flex: 1,
    backgroundColor: COLORS.gray[100],
    paddingVertical: SPACING.SMALL,
    borderRadius: BORDER_RADIUS.MEDIUM,
    alignItems: 'center',
  },
  filterButtonText: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },
  scheduleList: {
    paddingHorizontal: SPACING.LARGE,
    maxHeight: hp('50%'),
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.MEDIUM,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[100],
  },
  scheduleTime: {
    width: 60,
    alignItems: 'center',
  },
  scheduleTimeText: {
    fontSize: FONT_SIZES.CAPTION,
    fontWeight: '600',
    color: COLORS.primary[500],
  },
  scheduleDetails: {
    flex: 1,
    marginLeft: SPACING.MEDIUM,
  },
  scheduleTitle: {
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.TINY,
  },
  scheduleLocation: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.secondary,
    marginBottom: SPACING.TINY,
  },
  scheduleDuration: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.primary[500],
    fontWeight: '500',
  },
  scheduleAction: {
    padding: SPACING.SMALL,
  },
  // Form Validation Styles
  selectedText: {
    color: COLORS.text.primary,
    fontWeight: '500',
  },
  disabledButton: {
    backgroundColor: COLORS.gray[300],
    opacity: 0.6,
  },
  disabledButtonText: {
    color: COLORS.gray[500],
  },
  // Dropdown Styles
  dropdown: {
    backgroundColor: COLORS.background.secondary,
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    marginTop: SPACING.SMALL,
    maxHeight: 150,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dropdownItem: {
    padding: SPACING.MEDIUM,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[100],
  },
  dropdownItemText: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.primary,
    fontWeight: '500',
  },
  dropdownItemSubtext: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.secondary,
    marginTop: SPACING.TINY,
  },
  // Active Filter Styles
  activeFilterButton: {
    backgroundColor: COLORS.primary[500],
  },
  activeFilterButtonText: {
    color: COLORS.white,
    fontWeight: '600',
  },
  // Empty State Styles
  emptyStateContainer: {
    alignItems: 'center',
    padding: SPACING.XLARGE,
    marginTop: SPACING.LARGE,
  },
  emptyStateText: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.secondary,
    marginTop: SPACING.MEDIUM,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.tertiary,
    marginTop: SPACING.SMALL,
    textAlign: 'center',
  },
  // Job Details Styles
  jobDetailsContent: {
    padding: SPACING.LARGE,
  },
  jobDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: SPACING.SMALL,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[100],
  },
  jobDetailLabel: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.secondary,
    fontWeight: '500',
    flex: 1,
  },
  jobDetailValue: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.primary,
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },

  // Job Action Button Styles
  editButton: {
    flex: 1,
    backgroundColor: COLORS.accent.blue,
    paddingVertical: SPACING.MEDIUM,
    borderRadius: BORDER_RADIUS.MEDIUM,


    // backgroundColor: COLORS.accent.blue,
    // flex: 1,
    // marginHorizontal: SPACING.SMALL,
  },
  editButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.BODY,
    fontWeight: '600',
    textAlign: 'center',
  },
  followUpButton: {
    backgroundColor: COLORS.accent.green,
    flex: 1,
    marginHorizontal: SPACING.SMALL,
  },
  followUpButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Job Completion Form Styles
  completionForm: {
    padding: SPACING.LARGE,
    maxHeight: hp('60%'),
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray[50],
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: SPACING.MEDIUM,
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    borderStyle: 'dashed',
  },
  photoButtonText: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.primary[500],
    marginLeft: SPACING.SMALL,
    fontWeight: '500',
  },
  photoCountText: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.secondary,
    marginTop: SPACING.SMALL,
    textAlign: 'center',
  },
  // iOS Picker Modal Styles
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: COLORS.background.secondary,
    borderTopLeftRadius: BORDER_RADIUS.LARGE,
    borderTopRightRadius: BORDER_RADIUS.LARGE,
    paddingBottom: SPACING.LARGE,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: SPACING.MEDIUM,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[200],
  },
  pickerDoneButton: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.primary[500],
    fontWeight: '600',
  },
  iosDatePicker: {
    height: 200,
  },
  // Confirmation Modal Styles
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.LARGE,
  },
  confirmModalContent: {
    backgroundColor: COLORS.background.secondary,
    borderRadius: BORDER_RADIUS.LARGE,
    padding: SPACING.XLARGE,
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
  },
  confirmModalTitle: {
    fontSize: FONT_SIZES.LARGE,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginTop: SPACING.MEDIUM,
    marginBottom: SPACING.SMALL,
    textAlign: 'center',
  },
  confirmModalMessage: {
    fontSize: FONT_SIZES.MEDIUM,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: SPACING.LARGE,
    lineHeight: 22,
  },
  confirmModalActions: {
    flexDirection: 'row',
    gap: SPACING.MEDIUM,
    width: '100%',
  },
  confirmModalButton: {
    flex: 1,
    paddingVertical: SPACING.MEDIUM,
    borderRadius: BORDER_RADIUS.MEDIUM,
    alignItems: 'center',
  },
  confirmModalCancelButton: {
    backgroundColor: COLORS.gray[100],
  },
  confirmModalCancelText: {
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },
  confirmModalConfirmButton: {
    backgroundColor: COLORS.primary[500],
  },
  confirmModalConfirmText: {
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    color: COLORS.white,
  },

  // Job Edit Modal Styles
  editForm: {
    flex: 1,
  },
  editFormContent: {
    flex: 1,
    paddingHorizontal: SPACING.LARGE,
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.MEDIUM,
  },
  halfWidth: {
    flex: 1,
    marginHorizontal: SPACING.SMALL,
  },
  statusSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.SMALL,
  },
  statusOption: {
    flex: 1,
    paddingVertical: SPACING.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: COLORS.gray[100],
    marginHorizontal: SPACING.TINY,
    alignItems: 'center',
  },
  statusOptionSelected: {
    backgroundColor: COLORS.primary[500],
  },
  statusOptionText: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },
  statusOptionTextSelected: {
    color: COLORS.white,
    fontWeight: '600',
  },
  photoList: {
    marginTop: SPACING.SMALL,
  },
  photoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.gray[50],
    paddingVertical: SPACING.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    borderRadius: BORDER_RADIUS.SMALL,
    marginBottom: SPACING.SMALL,
  },
  photoItemText: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.primary,
  },
  removePhotoButton: {
    padding: SPACING.TINY,
  },

  // Estimates Modal Styles
  estimatesActions: {
    paddingHorizontal: SPACING.LARGE,
    paddingVertical: SPACING.MEDIUM,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[200],
  },
  createEstimateButton: {
    backgroundColor: COLORS.primary[500],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.MEDIUM,
    paddingHorizontal: SPACING.LARGE,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  createEstimateButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    marginLeft: SPACING.SMALL,
  },
  estimatesList: {
    flex: 1,
    paddingHorizontal: SPACING.LARGE,
  },
  estimateItem: {
    backgroundColor: COLORS.gray[50],
    padding: SPACING.MEDIUM,
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginBottom: SPACING.MEDIUM,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },
  estimateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.SMALL,
  },
  estimateCustomer: {
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    color: COLORS.text.primary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  statusDraft: {
    backgroundColor: COLORS.gray[200],
  },
  statusSent: {
    backgroundColor: COLORS.blue[200],
  },
  statusAccepted: {
    backgroundColor: COLORS.green[200],
  },
  statusDeclined: {
    backgroundColor: COLORS.red[200],
  },
  statusText: {
    fontSize: FONT_SIZES.SMALL,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  estimateService: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.secondary,
    marginBottom: SPACING.TINY,
  },
  estimateCost: {
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    color: COLORS.primary[500],
    marginBottom: SPACING.TINY,
  },
  estimateNumber: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.primary[500],
    fontWeight: '600',
    marginBottom: SPACING.TINY,
  },
  estimateDate: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.secondary,
    marginBottom: SPACING.TINY,
  },
  estimateValidUntil: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.secondary,
    marginBottom: SPACING.SMALL,
  },
  estimateActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  estimateActionButton: {
    backgroundColor: COLORS.primary[500],
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    borderRadius: BORDER_RADIUS.SMALL,
    flex: 1,
    marginHorizontal: SPACING.TINY,
  },
  estimateActionText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.SMALL,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: COLORS.gray[200],
  },
  secondaryButtonText: {
    color: COLORS.text.primary,
    fontSize: FONT_SIZES.SMALL,
    fontWeight: '600',
    textAlign: 'center',
  },
  estimateForm: {
    flex: 1,
    height: hp('70%'),
  },
  estimateFormContent: {
    flex: 1,
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
  },

  // Template Modal Styles
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gray[100],
    padding: SPACING.SMALL,
    borderRadius: BORDER_RADIUS.SMALL,
    marginRight: SPACING.SMALL,
    width: 40,
    height: 40,
  },
  templateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray[100],
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    borderRadius: BORDER_RADIUS.SMALL,
    marginRight: SPACING.MEDIUM,
  },
  templateButtonText: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.primary[500],
    fontWeight: '600',
    marginLeft: SPACING.TINY,
  },
  templateList: {
    flex: 1,
    paddingHorizontal: SPACING.LARGE,
    paddingVertical: SPACING.MEDIUM,
  },
  templateItem: {
    backgroundColor: COLORS.gray[50],
    padding: SPACING.MEDIUM,
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginBottom: SPACING.MEDIUM,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.SMALL,
  },
  templateTitle: {
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    color: COLORS.text.primary,
    flex: 1,
  },
  templatePrice: {
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    color: COLORS.primary[500],
  },
  templateDescription: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.secondary,
    marginBottom: SPACING.SMALL,
  },
  templateDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  templateDetail: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.text.secondary,
  },
});

export default HomeScreen;
