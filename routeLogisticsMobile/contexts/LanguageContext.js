import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

// Translation strings
const translations = {
  en: {
    // Home Screen
    welcome: 'Welcome back',
    yourServices: 'Your Services',
    noServicesSelected: 'No services selected yet',
    goToSettings: 'Go to Settings to add your services',
    quickActions: 'Quick Actions',
    scheduleService: 'Schedule Service',
    schedule: 'Schedule',
    viewRoutes: 'View Routes',
    takePhotos: 'Take Photos',
    estimates: 'Estimates',
    
    // Menu
    miFactotum: 'Route Logistics',
    customers: 'Customers',
    signOut: 'Sign Out',
    
    // Schedule Service Modal
    scheduleServiceTitle: 'Schedule Service',
    customer: 'Customer',
    selectCustomer: 'Select Customer',
    serviceType: 'Service Type',
    selectService: 'Select Service',
    date: 'Date',
    selectDate: 'Select Date',
    time: 'Time',
    selectTime: 'Select Time',
    expectedDuration: 'Expected Duration (hours)',
    estimatedCost: 'Estimated Cost (optional)',
    notes: 'Notes',
    scheduleServiceButton: 'Schedule Service',
    cancel: 'Cancel',
    
    // Customer Modal
    customersTitle: 'Customers',
    addNewCustomer: 'Add New Customer',
    customerName: 'Customer Name',
    customerPhone: 'Phone Number',
    customerAddress: 'Address',
    customerEmail: 'Email (optional)',
    addCustomer: 'Add Customer',
    edit: 'Edit',
    delete: 'Delete',
    noCustomersAvailable: 'No customers available',
    noServicesAvailable: 'No services available',
    
    // Schedule Modal
    scheduleTitle: 'Schedule',
    day: 'Day',
    week: 'Week',
    month: 'Month',
    
    // Settings Screen
    settings: 'Settings',
    profileInformation: 'Profile Information',
    businessName: 'Business Name',
    phoneNumber: 'Phone Number',
    address: 'Address',
    language: 'Language',
    services: 'Services',
    manageServices: 'Manage Services',
    servicesSelected: 'services selected',
    notifications: 'Notifications',
    pushNotifications: 'Push Notifications',
    receiveAppNotifications: 'Receive app notifications',
    emailNotifications: 'Email Notifications',
    receiveEmailUpdates: 'Receive email updates',
    smsNotifications: 'SMS Notifications',
    receiveSmsUpdates: 'Receive SMS updates',
    saveChanges: 'Save Changes',
    
    // Common
    success: 'Success',
    error: 'Error',
    ok: 'OK',
    loading: 'Loading...',
  },
  es: {
    // Home Screen
    welcome: 'Bienvenido de vuelta',
    yourServices: 'Tus Servicios',
    noServicesSelected: 'Aún no se han seleccionado servicios',
    goToSettings: 'Ve a Configuración para agregar tus servicios',
    quickActions: 'Acciones Rápidas',
    scheduleService: 'Programar Servicio',
    schedule: 'Programar',
    viewRoutes: 'Ver Rutas',
    takePhotos: 'Tomar Fotos',
    estimates: 'Presupuestos',
    
    // Menu
    miFactotum: 'Route Logistics',
    customers: 'Clientes',
    signOut: 'Cerrar Sesión',
    
    // Schedule Service Modal
    scheduleServiceTitle: 'Programar Servicio',
    customer: 'Cliente',
    selectCustomer: 'Seleccionar Cliente',
    serviceType: 'Tipo de Servicio',
    selectService: 'Seleccionar Servicio',
    date: 'Fecha',
    selectDate: 'Seleccionar Fecha',
    time: 'Hora',
    selectTime: 'Seleccionar Hora',
    expectedDuration: 'Duración Esperada (horas)',
    estimatedCost: 'Costo Estimado (opcional)',
    notes: 'Notas',
    scheduleServiceButton: 'Programar Servicio',
    cancel: 'Cancelar',
    
    // Customer Modal
    customersTitle: 'Clientes',
    addNewCustomer: 'Agregar Nuevo Cliente',
    customerName: 'Nombre del Cliente',
    customerPhone: 'Número de Teléfono',
    customerAddress: 'Dirección',
    customerEmail: 'Correo Electrónico (opcional)',
    addCustomer: 'Agregar Cliente',
    edit: 'Editar',
    delete: 'Eliminar',
    noCustomersAvailable: 'No hay clientes disponibles',
    noServicesAvailable: 'No hay servicios disponibles',
    
    // Schedule Modal
    scheduleTitle: 'Programación',
    day: 'Día',
    week: 'Semana',
    month: 'Mes',
    
    // Settings Screen
    settings: 'Configuración',
    profileInformation: 'Información del Perfil',
    businessName: 'Nombre del Negocio',
    phoneNumber: 'Número de Teléfono',
    address: 'Dirección',
    language: 'Idioma',
    services: 'Servicios',
    manageServices: 'Gestionar Servicios',
    servicesSelected: 'servicios seleccionados',
    notifications: 'Notificaciones',
    pushNotifications: 'Notificaciones Push',
    receiveAppNotifications: 'Recibir notificaciones de la aplicación',
    emailNotifications: 'Notificaciones por Correo',
    receiveEmailUpdates: 'Recibir actualizaciones por correo',
    smsNotifications: 'Notificaciones SMS',
    receiveSmsUpdates: 'Recibir actualizaciones por SMS',
    saveChanges: 'Guardar Cambios',
    
    // Common
    success: 'Éxito',
    error: 'Error',
    ok: 'OK',
    loading: 'Cargando...',
  }
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('English');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem('app_language');
      if (savedLanguage) {
        setLanguage(savedLanguage);
      }
    } catch (error) {
      console.error('Error loading language:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const changeLanguage = async (newLanguage) => {
    try {
      setLanguage(newLanguage);
      await AsyncStorage.setItem('app_language', newLanguage);
    } catch (error) {
      console.error('Error saving language:', error);
    }
  };

  const t = (key) => {
    const lang = language === 'English' ? 'en' : 'es';
    return translations[lang][key] || key;
  };

  const value = {
    language,
    changeLanguage,
    t,
    isLoading,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export default LanguageContext;
