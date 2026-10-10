import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SiteCampaignAdminModuleScreen } from './SiteCampaignAdminModuleScreen';
import { SiteCampaignPermissionMatrixScreen } from './SiteCampaignPermissionMatrixScreen';
import { SiteCampaignDeletionPanelScreen } from './SiteCampaignDeletionPanelScreen';

export interface SiteCampaignAdminPageScreenProps {
  isAdmin?: boolean;
}

export const SiteCampaignAdminPageScreen: React.FC<SiteCampaignAdminPageScreenProps> = ({
  isAdmin = true,
}) => {
  const [activeSection, setActiveSection] = useState<'campanhas' | 'permissoes' | 'exclusao'>('campanhas');

  return (
    <View style={styles.container}>
      {/* Top Hub Navigation Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarSubtitle}>Central de Marketing do Portal</Text>
        <Text style={styles.topBarTitle}>Gestão de Campanhas & Banners</Text>

        <View style={styles.hubTabsRow}>
          <TouchableOpacity
            style={[styles.hubTab, activeSection === 'campanhas' && styles.hubTabActive]}
            onPress={() => setActiveSection('campanhas')}
          >
            <Text
              style={[
                styles.hubTabText,
                activeSection === 'campanhas' && styles.hubTabTextActive,
              ]}
            >
              📢 Campanhas
            </Text>
          </TouchableOpacity>

          {isAdmin && (
            <TouchableOpacity
              style={[styles.hubTab, activeSection === 'permissoes' && styles.hubTabActive]}
              onPress={() => setActiveSection('permissoes')}
            >
              <Text
                style={[
                  styles.hubTabText,
                  activeSection === 'permissoes' && styles.hubTabTextActive,
                ]}
              >
                🔐 Permissões
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.hubTab, activeSection === 'exclusao' && styles.hubTabActive]}
            onPress={() => setActiveSection('exclusao')}
          >
            <Text
              style={[
                styles.hubTabText,
                activeSection === 'exclusao' && styles.hubTabTextActive,
              ]}
            >
              🗑️ Exclusão
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Render selected section */}
      <View style={styles.contentArea}>
        {activeSection === 'campanhas' && <SiteCampaignAdminModuleScreen />}
        {activeSection === 'permissoes' && <SiteCampaignPermissionMatrixScreen />}
        {activeSection === 'exclusao' && <SiteCampaignDeletionPanelScreen />}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  topBarSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6366f1',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 2,
  },
  hubTabsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  hubTab: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 4,
  },
  hubTabActive: {
    backgroundColor: '#17345f',
    borderColor: '#17345f',
  },
  hubTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  hubTabTextActive: {
    color: '#ffffff',
  },
  contentArea: {
    flex: 1,
  },
});
