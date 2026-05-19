import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AppNotification } from '../types';
import { cleanObject } from '../lib/utils';

export const notificationService = {
  /**
   * Create a persistent notification for admins or specific users
   */
  async createNotification(notification: Omit<AppNotification, 'id' | 'createdAt' | 'updatedAt' | 'isRead' | 'status'>) {
    try {
      const notificationData = {
        ...notification,
        isRead: false,
        status: 'unread',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      const docRef = await addDoc(collection(db, 'notifications'), cleanObject(notificationData));
      return docRef.id;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  },

  /**
   * Mark a notification as read
   */
  async markAsRead(id: string) {
    try {
      const docRef = doc(db, 'notifications', id);
      await updateDoc(docRef, { 
        isRead: true,
        status: 'read',
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  },

  /**
   * Archive a notification
   */
  async archive(id: string) {
    try {
      const docRef = doc(db, 'notifications', id);
      await updateDoc(docRef, { 
        status: 'archived',
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error archiving notification:', error);
      return false;
    }
  },

  /**
   * Delete a notification
   */
  async delete(id: string) {
    try {
      await deleteDoc(doc(db, 'notifications', id));
      return true;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  },

  /**
   * Mark all notifications as read for current user/admins
   */
  async markAllAsRead(userId?: string) {
    try {
      let q = query(collection(db, 'notifications'), where('status', '==', 'unread'));
      if (userId) {
        q = query(q, where('userId', '==', userId));
      }
      
      const snap = await getDocs(q);
      const promises = snap.docs.map(d => updateDoc(d.ref, { 
        isRead: true, 
        status: 'read',
        updatedAt: serverTimestamp() 
      }));
      
      await Promise.all(promises);
      return true;
    } catch (error) {
      console.error('Error marking all as read:', error);
      return false;
    }
  }
};
