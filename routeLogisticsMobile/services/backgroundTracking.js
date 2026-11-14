import * as TaskManager from 'expo-task-manager';
import { WORK_TRACKING_TASK, handleBackgroundWorkLocations, initializeWorkTracking } from './workTracking';

// A native background launch evaluates this before mounting navigation or screens.
TaskManager.defineTask(WORK_TRACKING_TASK, handleBackgroundWorkLocations);
initializeWorkTracking();
