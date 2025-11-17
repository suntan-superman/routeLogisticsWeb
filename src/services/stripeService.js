/**
 * Stripe Payment Service
 * Handles payment processing for invoices
 */

import { loadStripe } from '@stripe/stripe-js';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const PROJECT_ID = 'mi-factotum-field-service';
const FUNCTIONS_BASE_URL = `https://us-central1-${PROJECT_ID}.cloudfunctions.net`;

class StripeService {
  static stripePromise = null;

  /**
   * Initialize Stripe
   */
  static async getStripe() {
    if (!STRIPE_PUBLISHABLE_KEY) {
      throw new Error('Stripe publishable key not configured');
    }

    if (!this.stripePromise) {
      this.stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
    }

    return this.stripePromise;
  }

  /**
   * Create payment intent for an invoice
   */
  static async createPaymentIntent(invoiceId, amount) {
    try {
      // Get auth token
      const { auth } = await import('./firebase');
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        return {
          success: false,
          error: 'You must be authenticated to process payments'
        };
      }

      const token = await currentUser.getIdToken();

      // Call Cloud Function to create payment intent
      const response = await fetch(`${FUNCTIONS_BASE_URL}/createPaymentIntent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          invoiceId,
          amount
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.error || 'Failed to create payment intent'
        };
      }

      return {
        success: true,
        clientSecret: data.clientSecret,
        paymentIntentId: data.paymentIntentId
      };
    } catch (error) {
      console.error('Error creating payment intent:', error);
      return {
        success: false,
        error: error.message || 'Failed to create payment intent'
      };
    }
  }

  /**
   * Process payment using Stripe Elements
   */
  static async processPayment(invoiceId, amount, paymentMethod) {
    try {
      // Create payment intent
      const intentResult = await this.createPaymentIntent(invoiceId, amount);
      
      if (!intentResult.success) {
        return intentResult;
      }

      const stripe = await this.getStripe();
      
      // Confirm payment with payment method
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        intentResult.clientSecret,
        {
          payment_method: paymentMethod.id
        }
      );

      if (error) {
        return {
          success: false,
          error: error.message || 'Payment failed'
        };
      }

      return {
        success: true,
        paymentIntent
      };
    } catch (error) {
      console.error('Error processing payment:', error);
      return {
        success: false,
        error: error.message || 'Payment processing failed'
      };
    }
  }

  /**
   * Redirect to Stripe Checkout
   * Alternative payment flow using Stripe Checkout
   */
  static async redirectToCheckout(invoiceId, amount, invoiceNumber, customerEmail) {
    try {
      // Create payment intent first
      const intentResult = await this.createPaymentIntent(invoiceId, amount);
      
      if (!intentResult.success) {
        return intentResult;
      }

      const stripe = await this.getStripe();
      
      // Redirect to Stripe Checkout
      const { error } = await stripe.redirectToCheckout({
        sessionId: intentResult.clientSecret // Note: This would need Checkout Session instead
      });

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Error redirecting to checkout:', error);
      return {
        success: false,
        error: error.message || 'Failed to redirect to checkout'
      };
    }
  }
}

export default StripeService;

