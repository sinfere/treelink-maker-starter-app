import React, { useCallback, useMemo, useState } from 'react'
import { FlatList } from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { uniq } from 'lodash'
import { useHotspotBle } from '@helium/react-native-sdk'
import { useAnalytics } from '@segment/analytics-react-native'
import BackScreen from '../../../components/BackScreen'
import Text from '../../../components/Text'
import {
  HotspotSetupNavigationProp,
  HotspotSetupStackParamList,
} from './hotspotSetupTypes'
import Box from '../../../components/Box'
import CarotRight from '../../../assets/images/carot-right.svg'
import { useColors } from '../../../theme/themeHooks'
import { DebouncedButton } from '../../../components/Button'
import TouchableOpacityBox from '../../../components/TouchableOpacityBox'
import Checkmark from '../../../assets/images/check.svg'
import { RootNavigationProp } from '../../../navigation/main/tabTypes'
import { getAddress, getSecureItem } from '../../../utils/secureAccount'
import { getHotspotDetails } from '../../../utils/appDataClient'
import { HotspotEvents } from '../../../utils/analytics/events'

const WifiItem = ({
  name,
  isFirst = false,
  isLast = false,
  icon = 'carot',
  onPress,
}: {
  name: string
  isFirst?: boolean
  isLast?: boolean
  icon?: 'carot' | 'check'
  onPress?: () => void
}) => {
  const colors = useColors()
  return (
    <TouchableOpacityBox
      onPress={onPress}
      backgroundColor="white"
      padding="m"
      marginBottom="xxxs"
      flexDirection="row"
      justifyContent="space-between"
      borderTopLeftRadius={isFirst ? 'm' : 'none'}
      borderTopRightRadius={isFirst ? 'm' : 'none'}
      borderBottomLeftRadius={isLast ? 'm' : 'none'}
      borderBottomRightRadius={isLast ? 'm' : 'none'}
    >
      <Text variant="body2" color="black">
        {name}
      </Text>
      {icon === 'carot' && <CarotRight color={colors.secondaryBackground} />}
      {icon === 'check' && <Checkmark />}
    </TouchableOpacityBox>
  )
}

type Route = RouteProp<HotspotSetupStackParamList, 'HotspotSetupPickWifiScreen'>
const HotspotSetupPickWifiScreen = () => {
  const { t } = useTranslation()
  const navigation = useNavigation<HotspotSetupNavigationProp>()
  const rootNav = useNavigation<RootNavigationProp>()

  const { track } = useAnalytics()

  const {
    params: {
      networks,
      connectedNetworks,
      hotspotAddress,
      addGatewayTxn,
      hotspotType,
    },
  } = useRoute<Route>()
  const { readWifiNetworks } = useHotspotBle()

  const [wifiNetworks, setWifiNetworks] = useState(networks)
  const [connectedWifiNetworks, setConnectedWifiNetworks] = useState(
    connectedNetworks,
  )
  const [scanning, setScanning] = useState(false)

  const handleClose = useCallback(() => rootNav.navigate('MainTabs'), [rootNav])

  const hasNetworks = useMemo(() => {
    if (!wifiNetworks?.length) return false
    return wifiNetworks.length > 0
  }, [wifiNetworks])

  const navSkip = useCallback(async () => {
    const token = await getSecureItem('walletLinkToken')
    if (!token) return
    const address = await getAddress()

    // Handle "404 not found" exception when onboarding new device
    let hotspot
    try {
      hotspot = await getHotspotDetails(hotspotAddress)
    } catch (error) {
      if (error?.status === 404) {
        // Silencing the 404 error since it means the hotspot is not on chain and
        // it is needed to move forward to onboarding.
      } else {
        throw error
      }
    }

    if (hotspot && hotspot.owner === address) {
      navigation.replace('OwnedHotspotErrorScreen')
    } else if (hotspot && hotspot.owner !== address) {
      navigation.replace('NotHotspotOwnerErrorScreen')
    } else {
      navigation.replace('HotspotSetupLocationInfoScreen', {
        hotspotAddress,
        addGatewayTxn,
        hotspotType,
      })
    }
  }, [addGatewayTxn, hotspotAddress, navigation, hotspotType])

  const navNext = (network: string) => {
    navigation.navigate('HotspotSetupWifiScreen', {
      network,
      hotspotAddress,
      addGatewayTxn,
      hotspotType,
    })
  }

  const scanForNetworks = async () => {
    setScanning(true)

    // Segment track for wifi scan
    track(HotspotEvents.WIFI_SCAN_STARTED)

    const newNetworks = uniq((await readWifiNetworks(false)) || [])
    const newConnectedNetworks = uniq((await readWifiNetworks(true)) || [])
    setScanning(false)
    setWifiNetworks(newNetworks)
    setConnectedWifiNetworks(newConnectedNetworks)

    // Segment track for wifi scan
    track(HotspotEvents.WIFI_SCAN_FINISHED, {
      networks_count: newNetworks.length,
      connected_networks_count: newConnectedNetworks.length,
    })
  }

  return (
    <BackScreen
      padding="none"
      backgroundColor="primaryBackground"
      onClose={handleClose}
    >
      <Box
        backgroundColor="primaryBackground"
        padding="m"
        paddingTop="xl"
        alignItems="center"
      >
        <Text
          variant="h1"
          textAlign="center"
          marginBottom="m"
          maxFontSizeMultiplier={1}
        >
          {t('hotspot_setup.wifi_scan.title')}
        </Text>
        <Text
          variant="subtitle1"
          textAlign="center"
          marginBottom="m"
          maxFontSizeMultiplier={1.1}
        >
          {t('hotspot_setup.wifi_scan.subtitle')}
        </Text>
        <DebouncedButton
          loading={scanning}
          onPress={scanForNetworks}
          title={t('hotspot_setup.wifi_scan.scan_networks')}
          variant="primary"
          height={50}
          width="90%"
          marginVertical="s"
          disabled={scanning}
          mode="contained"
        />
      </Box>
      <Box paddingHorizontal="l" flex={1} backgroundColor="secondaryBackground">
        <FlatList
          data={wifiNetworks}
          keyExtractor={(item) => item}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Box marginTop="l">
              {connectedWifiNetworks.length > 0 && (
                <Box marginBottom="m">
                  <Text
                    variant="body1"
                    marginBottom="s"
                    maxFontSizeMultiplier={1.2}
                  >
                    {t('hotspot_setup.wifi_scan.saved_networks')}
                  </Text>
                  {connectedWifiNetworks.map((network, index) => (
                    <WifiItem
                      key={network}
                      name={network}
                      isFirst={index === 0}
                      isLast={index === connectedWifiNetworks.length - 1}
                      icon="check"
                      onPress={navSkip}
                    />
                  ))}
                </Box>
              )}
              <Text
                variant="body1"
                marginBottom="s"
                maxFontSizeMultiplier={1.2}
                visible={hasNetworks}
              >
                {t('hotspot_setup.wifi_scan.available_networks')}
              </Text>
            </Box>
          }
          renderItem={({ item, index }) => (
            <WifiItem
              name={item}
              isFirst={index === 0}
              isLast={index === wifiNetworks.length - 1}
              onPress={() => navNext(item)}
            />
          )}
          ListEmptyComponent={
            <Box margin="l">
              <Text
                variant="body1"
                marginBottom="l"
                textAlign="center"
                color="primaryText"
              >
                {t('hotspot_setup.wifi_scan.not_found_title')}
              </Text>
              <Text variant="body1" textAlign="center" color="primaryText">
                {t('hotspot_setup.wifi_scan.not_found_desc')}
              </Text>
            </Box>
          }
        />
        <DebouncedButton
          variant="secondary"
          title={t('hotspot_setup.wifi_scan.ethernet')}
          marginVertical="m"
          onPress={navSkip}
        />
      </Box>
    </BackScreen>
  )
}

export default HotspotSetupPickWifiScreen
