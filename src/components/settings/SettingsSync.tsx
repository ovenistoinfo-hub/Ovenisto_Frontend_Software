import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { settingsService } from '../../services/settings.service';

export function SettingsSync() {
  const { user } = useAuth();
  const { updateSettings } = useData();
  // The customer-facing QR page is public: a stale staff login left on the device must not
  // trigger an authenticated call there (a 401 would bounce the customer to /login).
  const onPublicPage = useLocation().pathname.startsWith('/self-order');

  useEffect(() => {
    if (!user || onPublicPage) return;

    // Super Admin is decided by role: an account can carry an outletId and still be one.
    const isBranchUser = Boolean(user.outletId) && user.role !== 'Super Admin';
    const fetchSettings = isBranchUser
      ? settingsService.getMySettings()
      : settingsService.getSettings();

    fetchSettings.then((data) => {
      updateSettings({
        restaurantName: data.restaurantName || '',
        phone: data.phone || '',
        email: data.email || '',
        currency: data.currency || 'Rs.',
        taxName: data.taxName || 'GST',
        taxRate: Number(data.taxRate ?? 16),
        address: data.address || '',
        receiptHeader: data.receiptHeader || '',
        tableManagement: data.tableManagement,
        onlineOrders: data.onlineOrders,
        paymentMethods: data.paymentMethods,
      });
    }).catch(() => {});
  }, [user?.id, user?.outletId, user?.role, onPublicPage, updateSettings]);

  return null;
}
