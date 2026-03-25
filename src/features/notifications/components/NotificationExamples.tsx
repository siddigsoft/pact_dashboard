// Example: Complete Component with WhatsApp Notifications
// This file demonstrates how to use the notification system in real components

import React, { useState } from 'react';
import { useNotifications } from '../context/NotificationContext';

/**
 * Example component showing all notification types in action
 * Copy this pattern to use notifications in your own components
 */
export function NotificationExamples() {
  const { success, error, warning, info, task } = useNotifications();
  const [loading, setLoading] = useState(false);

  // Success example - operations that complete successfully
  const handleSaveData = async () => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      success('Data Saved', 'Your changes have been saved successfully');
    } catch (err) {
      error('Save Failed', 'Unable to save your changes');
    } finally {
      setLoading(false);
    }
  };

  // Error example - when operations fail
  const handleDeleteWithError = () => {
    error('Deletion Failed', 'You do not have permission to delete this item');
  };

  // Warning example - caution alerts
  const handleSlowNetwork = () => {
    warning('Slow Connection Detected', 'This may take longer than usual');
  };

  // Info example - informational messages
  const handleShowInfo = () => {
    info('Update Available', 'Version 2.1 is now available. Refresh to update.');
  };

  // Task example - long-running operations
  const handleStartTask = async () => {
    task('Processing', 'Generating report... Please wait');
    
    // Simulate long operation
    await new Promise(resolve => setTimeout(resolve, 3000));
    success('Complete', 'Report generated successfully');
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold mb-6">Notification Examples</h2>
      
      {/* Success Notification Button */}
      <button
        onClick={handleSaveData}
        disabled={loading}
        className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
      >
        {loading ? 'Saving...' : 'Save (Success)'}
      </button>

      {/* Error Notification Button */}
      <button
        onClick={handleDeleteWithError}
        className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
      >
        Delete (Error)
      </button>

      {/* Warning Notification Button */}
      <button
        onClick={handleSlowNetwork}
        className="w-full px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
      >
        Check Network (Warning)
      </button>

      {/* Info Notification Button */}
      <button
        onClick={handleShowInfo}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Show Info (Info)
      </button>

      {/* Task Notification Button */}
      <button
        onClick={handleStartTask}
        className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
      >
        Generate Report (Task)
      </button>
    </div>
  );
}

/**
 * Real-world example: User authentication with notifications
 */
export function LoginForm() {
  const { success, error, task } = useNotifications();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      error('Validation Failed', 'Please enter both email and password');
      return;
    }

    setLoading(true);
    task('Logging In', 'Authenticating your credentials...');

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulate success
      if (email.includes('@')) {
        success('Welcome Back', 'Login successful! Redirecting...');
        // Reset form
        setEmail('');
        setPassword('');
      } else {
        error('Login Failed', 'Invalid email address');
      }
    } catch (err) {
      error('Authentication Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="p-6 space-y-4 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6">Login</h2>
      
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        className="w-full px-4 py-2 border rounded"
        disabled={loading}
      />

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full px-4 py-2 border rounded"
        disabled={loading}
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}

/**
 * Real-world example: File upload with notifications
 */
export function FileUpload() {
  const { task, success, error, warning } = useNotifications();
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      error('File Too Large', 'Maximum file size is 5MB');
      return;
    }

    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      error('Invalid File Type', 'Only JPEG, PNG, and PDF files are allowed');
      return;
    }

    setUploading(true);
    task('Uploading', `Uploading ${file.name}...`);

    try {
      // Simulate upload delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      success('Upload Complete', `${file.name} uploaded successfully`);
    } catch (err) {
      error('Upload Failed', 'Unable to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 space-y-4 border-2 border-dashed rounded">
      <h3 className="font-bold">Upload File</h3>
      
      <input
        type="file"
        onChange={handleFileUpload}
        disabled={uploading}
        className="w-full"
        accept=".jpg,.jpeg,.png,.pdf"
      />
      
      <p className="text-sm text-gray-600">
        Max size: 5MB • Accepted: JPEG, PNG, PDF
      </p>
    </div>
  );
}

/**
 * Real-world example: Data deletion with confirmation
 */
export function DeleteDataComponent() {
  const { warning, success, error } = useNotifications();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    warning('Deleting Item', 'Please wait while we delete this item...');
    setIsDeleting(true);

    try {
      // Simulate deletion
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      success('Deleted Successfully', 'The item has been permanently removed');
    } catch (err) {
      error('Deletion Failed', 'Could not delete item. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-4 bg-red-50 border border-red-200 rounded">
      <h3 className="font-bold text-red-700">Danger Zone</h3>
      
      <p className="text-sm">
        This action cannot be undone. Please proceed with caution.
      </p>

      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
      >
        {isDeleting ? 'Deleting...' : 'Delete Item'}
      </button>
    </div>
  );
}

/**
 * Real-world example: Form submission with error handling
 */
export function ContactForm() {
  const { task, success, error } = useNotifications();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    if (!formData.name || !formData.email || !formData.message) {
      error('Missing Fields', 'Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    task('Sending', 'Your message is being sent...');

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      success('Message Sent', 'Thank you for contacting us. We will reply soon.');
      
      // Reset form
      setFormData({ name: '', email: '', message: '' });
    } catch (err) {
      error('Send Failed', 'Unable to send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6">Contact Us</h2>
      
      <input
        type="text"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="Your name"
        className="w-full px-4 py-2 border rounded"
        disabled={submitting}
      />

      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        placeholder="Your email"
        className="w-full px-4 py-2 border rounded"
        disabled={submitting}
      />

      <textarea
        value={formData.message}
        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
        placeholder="Your message"
        rows={4}
        className="w-full px-4 py-2 border rounded"
        disabled={submitting}
      />

      <button
        type="submit"
        disabled={submitting}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {submitting ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  );
}

export default NotificationExamples;
