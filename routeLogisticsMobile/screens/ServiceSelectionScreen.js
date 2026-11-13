import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { FONT_SIZES, SPACING, BORDER_RADIUS, hp, wp } from '../constants/responsiveSizes';

// Service categories and services from the handyman services list
const SERVICE_CATEGORIES = [
  {
    id: 'general_handyman',
    name: 'General Handyman & Repair',
    icon: 'build',
    color: COLORS.primary[500],
    services: [
      'Furniture assembly and installation',
      'Door and window repair or replacement',
      'Lock replacement and rekeying',
      'Drywall patching and repair',
      'Tile, grout, and caulking repair',
      'Mounting TVs, shelves, mirrors, and artwork',
      'Weatherproofing and insulation',
      'Fence and gate repair',
      'Mailbox installation or repair',
      'Deck repair and staining'
    ]
  },
  {
    id: 'electrical_lighting',
    name: 'Electrical & Lighting',
    icon: 'flash-on',
    color: COLORS.accent.blue,
    services: [
      'Light fixture and ceiling fan installation',
      'Outlet and switch replacement',
      'Smoke and carbon monoxide detector installation',
      'Low-voltage wiring (doorbells, thermostats, security cameras)',
      'Landscape or exterior lighting maintenance'
    ]
  },
  {
    id: 'plumbing_water',
    name: 'Plumbing & Water Services',
    icon: 'water-drop',
    color: COLORS.accent.blue,
    services: [
      'Faucet, toilet, and showerhead installation or repair',
      'Garbage disposal installation',
      'Leak detection and repair (minor)',
      'Drain cleaning (non-industrial)',
      'Water filter or softener system installation'
    ]
  },
  {
    id: 'carpentry_custom',
    name: 'Carpentry & Custom Work',
    icon: 'carpenter',
    color: COLORS.orange[500],
    services: [
      'Custom shelving or cabinetry',
      'Trim, baseboard, and molding installation',
      'Closet build-outs or organization systems',
      'Deck construction or repair',
      'Stair and railing repair'
    ]
  },
  {
    id: 'painting_finishing',
    name: 'Painting & Finishing',
    icon: 'format-paint',
    color: COLORS.purple[500],
    services: [
      'Interior and exterior painting',
      'Touch-ups and color matching',
      'Wallpaper removal or installation',
      'Staining and varnishing woodwork',
      'Garage floor or concrete coating'
    ]
  },
  {
    id: 'outdoor_yard',
    name: 'Outdoor & Yard Services',
    icon: 'yard',
    color: COLORS.green[500],
    services: [
      'Lawn mowing and edging',
      'Hedge trimming and tree pruning',
      'Garden bed cleanup and mulching',
      'Sprinkler repair and adjustment',
      'Gutter cleaning and downspout flushing',
      'Pressure washing (driveways, siding, decks)',
      'Fence repair and painting'
    ]
  },
  {
    id: 'pool_spa',
    name: 'Pool & Spa Services',
    icon: 'pool',
    color: COLORS.blue[500],
    services: [
      'Routine pool cleaning and chemical balancing',
      'Filter and pump maintenance',
      'Tile cleaning and calcium removal',
      'Equipment inspection and repair',
      'Seasonal opening/closing services'
    ]
  },
  {
    id: 'pest_control',
    name: 'Pest Control Services',
    icon: 'bug-report',
    color: COLORS.red[500],
    services: [
      'Ant, spider, roach, and wasp treatments',
      'Rodent trapping and exclusion',
      'Termite inspection and spot treatment',
      'Bed bug and flea control',
      'Mosquito and outdoor pest management',
      'Wildlife removal (squirrels, raccoons, etc.)'
    ]
  },
  {
    id: 'hvac_appliance',
    name: 'HVAC & Appliance Services',
    icon: 'ac-unit',
    color: COLORS.gray[600],
    services: [
      'Filter replacement and vent cleaning',
      'Thermostat installation',
      'Window or portable AC unit installation',
      'Dryer vent cleaning',
      'Appliance hookup (washer, dryer, dishwasher)'
    ]
  },
  {
    id: 'cleaning_maintenance',
    name: 'Cleaning & Maintenance',
    icon: 'cleaning-services',
    color: COLORS.blue[400],
    services: [
      'Move-in/move-out cleaning',
      'Window cleaning',
      'Carpet and upholstery cleaning',
      'Pressure washing (house exteriors, walkways)',
      'Trash removal and hauling',
      'Janitorial or office cleaning'
    ]
  },
  {
    id: 'home_improvement',
    name: 'Home Improvement & Renovation',
    icon: 'home-repair-service',
    color: COLORS.orange[600],
    services: [
      'Kitchen or bathroom updates',
      'Flooring installation (laminate, vinyl, tile)',
      'Countertop and backsplash replacement',
      'Small remodeling projects',
      'Garage organization systems'
    ]
  },
  {
    id: 'hauling_misc',
    name: 'Hauling & Miscellaneous',
    icon: 'local-shipping',
    color: COLORS.gray[700],
    services: [
      'Junk removal and yard waste hauling',
      'Appliance or furniture delivery',
      'Moving assistance (load/unload)',
      'Snow removal',
      'Holiday light installation'
    ]
  }
];

const ServiceSelectionScreen = ({ navigation, onServicesSelected }) => {
  const [selectedServices, setSelectedServices] = useState([]);
  const [expandedCategory, setExpandedCategory] = useState(null);

  const toggleService = (service) => {
    setSelectedServices(prev => {
      if (prev.includes(service)) {
        return prev.filter(s => s !== service);
      } else {
        return [...prev, service];
      }
    });
  };

  const toggleCategory = (categoryId) => {
    setExpandedCategory(expandedCategory === categoryId ? null : categoryId);
  };

  const handleContinue = () => {
    if (selectedServices.length === 0) {
      alert('Please select at least one service to continue.');
      return;
    }
    
    if (onServicesSelected) {
      onServicesSelected(selectedServices);
    } else {
      // Navigate to next step in sign up process
      navigation.navigate('signup', { selectedServices });
    }
  };

  const ServiceItem = ({ service, isSelected, onToggle }) => (
    <TouchableOpacity
      style={[
        styles.serviceItem,
        isSelected && styles.serviceItemSelected
      ]}
      onPress={() => onToggle(service)}
    >
      <View style={styles.serviceItemContent}>
        <Text style={[
          styles.serviceText,
          isSelected && styles.serviceTextSelected
        ]}>
          {service}
        </Text>
        <MaterialIcons
          name={isSelected ? 'check-box' : 'check-box-outline-blank'}
          size={24}
          color={isSelected ? COLORS.primary[500] : COLORS.gray[400]}
        />
      </View>
    </TouchableOpacity>
  );

  const CategoryCard = ({ category }) => {
    const isExpanded = expandedCategory === category.id;
    const categorySelectedServices = selectedServices.filter(service => 
      category.services.includes(service)
    );

    return (
      <View style={styles.categoryCard}>
        <TouchableOpacity
          style={styles.categoryHeader}
          onPress={() => toggleCategory(category.id)}
        >
          <View style={styles.categoryHeaderLeft}>
            <View style={[styles.categoryIcon, { backgroundColor: category.color }]}>
              <MaterialIcons name={category.icon} size={24} color={COLORS.white} />
            </View>
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryName}>{category.name}</Text>
              <Text style={styles.categoryCount}>
                {categorySelectedServices.length} of {category.services.length} selected
              </Text>
            </View>
          </View>
          <MaterialIcons
            name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={24}
            color={COLORS.gray[600]}
          />
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.servicesList}>
            {category.services.map((service, index) => (
              <ServiceItem
                key={index}
                service={service}
                isSelected={selectedServices.includes(service)}
                onToggle={toggleService}
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background.primary} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Your Services</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introSection}>
          <Text style={styles.introTitle}>What services do you provide?</Text>
          <Text style={styles.introSubtitle}>
            Select all the services you offer to help customers find you for the right jobs.
          </Text>
        </View>

        {/* Service Categories */}
        <View style={styles.categoriesContainer}>
          {SERVICE_CATEGORIES.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </View>

        {/* Selected Services Summary */}
        {selectedServices.length > 0 && (
          <View style={styles.summarySection}>
            <Text style={styles.summaryTitle}>
              Selected Services ({selectedServices.length})
            </Text>
            <View style={styles.selectedServicesList}>
              {selectedServices.map((service, index) => (
                <View key={index} style={styles.selectedServiceItem}>
                  <Text style={styles.selectedServiceText}>{service}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            selectedServices.length === 0 && styles.continueButtonDisabled
          ]}
          onPress={handleContinue}
          disabled={selectedServices.length === 0}
        >
          <Text style={[
            styles.continueButtonText,
            selectedServices.length === 0 && styles.continueButtonTextDisabled
          ]}>
            Continue ({selectedServices.length} services)
          </Text>
          <Ionicons 
            name="arrow-forward" 
            size={20} 
            color={selectedServices.length === 0 ? COLORS.gray[400] : COLORS.white} 
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[200],
  },
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
  introSection: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  introTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  introSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  categoriesContainer: {
    paddingBottom: SPACING.xl,
  },
  categoryCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 2,
  },
  categoryCount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
  },
  servicesList: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  serviceItem: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[100],
  },
  serviceItemSelected: {
    backgroundColor: COLORS.primary[50],
  },
  serviceItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text.primary,
    flex: 1,
    marginRight: SPACING.sm,
  },
  serviceTextSelected: {
    color: COLORS.primary[700],
    fontWeight: '500',
  },
  summarySection: {
    backgroundColor: COLORS.primary[50],
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  summaryTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.primary[700],
    marginBottom: SPACING.sm,
  },
  selectedServicesList: {
    flexDirection: 'column',
  },
  selectedServiceItem: {
    backgroundColor: COLORS.primary[100],
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary[500],
  },
  selectedServiceText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary[700],
    fontWeight: '500',
  },
  moreServicesText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary[600],
    fontStyle: 'italic',
    alignSelf: 'center',
    marginTop: SPACING.xs,
  },
  footer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    backgroundColor: COLORS.background.primary,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[200],
  },
  continueButton: {
    backgroundColor: COLORS.primary[500],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
  },
  continueButtonDisabled: {
    backgroundColor: COLORS.gray[300],
  },
  continueButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.white,
    marginRight: SPACING.sm,
  },
  continueButtonTextDisabled: {
    color: COLORS.gray[500],
  },
});

export default ServiceSelectionScreen;
