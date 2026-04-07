import { NavigationContainer } from '@react-navigation/native';


const ComponentFunction = function() {
    // @section:imports @depends:[]
    const React = require('react');
    const { useState, useEffect, useContext, useMemo, useCallback } = React;
    const { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Platform, StatusBar, ActivityIndicator, KeyboardAvoidingView, FlatList, Image, Dimensions } = require('react-native');
    const { WebView } = require('react-native-webview');
    const { MaterialIcons } = require('@expo/vector-icons');
    const { createBottomTabNavigator } = require('@react-navigation/bottom-tabs');
    // @end:imports
  
    // @section:theme @depends:[]
    const storageStrategy = 'local';
    const primaryColor = '#1E40AF';
    const accentColor = '#3B82F6';
    const backgroundColor = '#F8FAFC';
    const cardColor = '#FFFFFF';
    const textPrimary = '#1F2937';
    const textSecondary = '#6B7280';
    const designStyle = 'modern';

    const railMapHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pedestrian Network Viewer</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.8.0/dist/leaflet.css" />
  <style>
    html, body { height: 100%; margin: 0; font-family: 'Poppins', sans-serif; }
    #map { height: 100%; width: 100%; }
    .legend {
      position: absolute; top: 10px; right: 10px; background: white; padding: 10px 12px;
      border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.15); z-index: 1000; font-size: 13px;
    }
    .legend h4 { margin: 0 0 8px 0; font-size: 14px; }
    .legend .item { display: flex; align-items: center; margin: 4px 0; }
    .legend .swatch { width: 14px; height: 4px; margin-right: 8px; border-radius: 2px; }
    .toolbar {
      position: absolute; left: 10px; top: 10px; z-index: 1000; display: flex; gap: 8px;
    }
    .toolbar button {
      border: none; padding: 8px 12px; border-radius: 8px; background: #3a86ff; color: white; cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet" />
</head>
<body>
  <div class="toolbar">
    <button onclick="window.history.back()">← Back</button>
    <button id="reload">Reload Area</button>
  </div>
  <div id="map"></div>
  <div class="legend" id="legend">
    <h4>Pedestrian Layers</h4>
    <div class="item"><span class="swatch" style="background:#16a34a"></span>Foot Path</div>
    <div class="item"><span class="swatch" style="background:#fb923c"></span>Path</div>
    <div class="item"><span class="swatch" style="background:#22c55e"></span>Sidewalk</div>
    <div class="item"><span class="swatch" style="background:#ef4444"></span>Steps</div>
    <div class="item"><span class="swatch" style="background:#3b82f6"></span>Pedestrian Street</div>
    <div class="item"><span class="swatch" style="background:#a855f7"></span>Marked Crossing</div>
    <div class="item"><span class="swatch" style="background:#f43f5e"></span>Informal Path</div>
  </div>

  <script src="https://unpkg.com/leaflet@1.8.0/dist/leaflet.js"></script>
  <script>
    const map = L.map('map').setView([19.054, 72.861], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    const layers = {
      foot_path: L.layerGroup().addTo(map),
      path: L.layerGroup().addTo(map),
      sidewalk: L.layerGroup().addTo(map),
      steps: L.layerGroup().addTo(map),
      pedestrian_street: L.layerGroup().addTo(map),
      marked_crossing: L.layerGroup().addTo(map),
      informal_path: L.layerGroup().addTo(map),
      pins: L.layerGroup().addTo(map)
    };

    const colors = {
      foot_path: '#16a34a',
      path: '#fb923c',
      sidewalk: '#22c55e',
      steps: '#ef4444',
      pedestrian_street: '#3b82f6',
      marked_crossing: '#a855f7',
      informal_path: '#f43f5e'
    };

    function clearAll() {
      Object.values(layers).forEach(group => group.clearLayers());
    }

    async function loadArea() {
      clearAll();
      const center = map.getCenter();
      const radius = 800; // meters
      const url = 'http://127.0.0.1:5000/api/paths?center=' +
        center.lat.toFixed(6) + ',' + center.lng.toFixed(6) +
        '&radius_m=' + radius + '&include_pins=1';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        if (data.status !== 'success') {
          console.error('Failed to load paths:', data);
          return;
        }

        function addPolylines(features, key) {
          (features || []).forEach(feat => {
            const latlngs = (feat.coords || []).map(c => [c.lat, c.lng]);
            if (latlngs.length >= 2) {
              L.polyline(latlngs, { color: colors[key], weight: 4, opacity: 0.9 }).addTo(layers[key]);
            }
          });
        }

        addPolylines(data.foot_path, 'foot_path');
        addPolylines(data.path, 'path');
        addPolylines(data.sidewalk, 'sidewalk');
        addPolylines(data.steps, 'steps');
        addPolylines(data.pedestrian_street, 'pedestrian_street');
        addPolylines(data.marked_crossing, 'marked_crossing');
        addPolylines(data.informal_path, 'informal_path');

        (data.pins || []).forEach(p => {
          L.marker([p.lat, p.lng]).bindPopup(p.name || 'Pin').addTo(layers.pins);
        });
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          console.error('API request timed out after 3 minutes');
        } else {
          console.error('Failed to load paths:', err);
        }
      }
    }

    map.on('moveend', loadArea);
    document.getElementById('reload').addEventListener('click', loadArea);
    loadArea();
  </script>
</body>
</html>`;
    // @end:theme
  
    // @section:navigation-setup @depends:[]
    const Tab = createBottomTabNavigator();
    // @end:navigation-setup
  
    // @section:ThemeContext @depends:[theme]
    const ThemeContext = React.createContext();
    const ThemeProvider = function(props) {
      const darkModeState = useState(false);
      const darkMode = darkModeState[0];
      const setDarkMode = darkModeState[1];
      
      const lightTheme = useMemo(function() {
        return {
          colors: {
            primary: primaryColor,
            accent: accentColor,
            background: backgroundColor,
            card: cardColor,
            textPrimary: textPrimary,
            textSecondary: textSecondary,
            border: '#E5E7EB',
            success: '#10B981',
            error: '#EF4444',
            warning: '#F59E0B'
          }
        };
      }, []);
      
      const darkTheme = useMemo(function() {
        return {
          colors: {
            primary: primaryColor,
            accent: accentColor,
            background: '#1F2937',
            card: '#374151',
            textPrimary: '#F9FAFB',
            textSecondary: '#D1D5DB',
            border: '#4B5563',
            success: '#10B981',
            error: '#EF4444',
            warning: '#F59E0B'
          }
        };
      }, []);
      
      const theme = darkMode ? darkTheme : lightTheme;
      
      const toggleDarkMode = useCallback(function() {
        setDarkMode(function(prev) { return !prev; });
      }, []);
      
      const value = useMemo(function() {
        return { theme: theme, darkMode: darkMode, toggleDarkMode: toggleDarkMode, designStyle: designStyle };
      }, [theme, darkMode, toggleDarkMode]);
      
      return React.createElement(ThemeContext.Provider, { value: value }, props.children);
    };
    
    const useTheme = function() { 
      return useContext(ThemeContext); 
    };
    // @end:ThemeContext
  
    // @section:NavigationScreen-state @depends:[ThemeContext]
    const useNavigationState = function() {
      const themeContext = useTheme();
      const theme = themeContext.theme;
      const searchQueryState = useState('');
      const searchQuery = searchQueryState[0];
      const setSearchQuery = searchQueryState[1];
      const selectedRouteState = useState(null);
      const selectedRoute = selectedRouteState[0];
      const setSelectedRoute = selectedRouteState[1];
      const searchResultsState = useState([]);
      const searchResults = searchResultsState[0];
      const setSearchResults = searchResultsState[1];
      
      const mockSearchData = useMemo(function() {
        return [
          { id: '1', name: 'Platform 1', type: 'platform', description: 'Express trains' },
          { id: '2', name: 'Platform 2', type: 'platform', description: 'Local trains' },
          { id: '3', name: 'Restroom', type: 'facility', description: 'Near Platform 1' },
          { id: '4', name: 'Food Court', type: 'facility', description: 'Level 2' },
          { id: '5', name: 'Ticket Counter', type: 'facility', description: 'Main entrance' },
          { id: '6', name: 'ATM', type: 'facility', description: 'Near exit gate' },
          { id: '7', name: 'Waiting Room', type: 'facility', description: 'Air conditioned' },
          { id: '8', name: 'Information Desk', type: 'facility', description: 'Ground floor' }
        ];
      }, []);
      
      return { 
        theme: theme, 
        searchQuery: searchQuery, 
        setSearchQuery: setSearchQuery,
        selectedRoute: selectedRoute,
        setSelectedRoute: setSelectedRoute,
        searchResults: searchResults,
        setSearchResults: setSearchResults,
        mockSearchData: mockSearchData
      };
    };
    // @end:NavigationScreen-state
  
    // @section:NavigationScreen-handlers @depends:[NavigationScreen-state]
    const navigationHandlers = {
      handleSearch: function(state, query) {
        state.setSearchQuery(query);
        if (query.length > 0) {
          const filtered = state.mockSearchData.filter(function(item) {
            return item.name.toLowerCase().indexOf(query.toLowerCase()) !== -1;
          });
          state.setSearchResults(filtered);
        } else {
          state.setSearchResults([]);
        }
      },
      
      selectDestination: function(state, destination) {
        state.setSelectedRoute(destination);
        state.setSearchResults([]);
        state.setSearchQuery(destination.name);
        Platform.OS === 'web' ? window.alert('Route calculated to ' + destination.name) : Alert.alert('Navigation', 'Route calculated to ' + destination.name);
      }
    };
    // @end:NavigationScreen-handlers
  
    // @section:NavigationScreen-SearchResults @depends:[styles]
    const renderSearchResults = function(results, onSelect, theme) {
      if (results.length === 0) return null;
      
      return React.createElement(View, { style: [styles.searchResults, { backgroundColor: theme.colors.card }], componentId: 'navigation-search-results' },
        React.createElement(FlatList, {
          data: results,
          keyExtractor: function(item) { return item.id; },
          renderItem: function(itemData) {
            const item = itemData.item;
            return React.createElement(TouchableOpacity, {
              style: [styles.searchResultItem, { borderBottomColor: theme.colors.border }],
              onPress: function() { onSelect(item); },
              componentId: 'search-result-' + item.id
            },
              React.createElement(View, { style: styles.searchResultContent },
                React.createElement(MaterialIcons, { 
                  name: item.type === 'platform' ? 'train' : 'place', 
                  size: 24, 
                  color: theme.colors.primary 
                }),
                React.createElement(View, { style: styles.searchResultText },
                  React.createElement(Text, { style: [styles.searchResultName, { color: theme.colors.textPrimary }] }, item.name),
                  React.createElement(Text, { style: [styles.searchResultDescription, { color: theme.colors.textSecondary }] }, item.description)
                )
              )
            );
          }
        })
      );
    };
    // @end:NavigationScreen-SearchResults
  
    // @section:NavigationScreen-MapView @depends:[styles]
    const renderMapView = function(selectedRoute, theme) {
      return React.createElement(View, { style: [styles.mapContainer, { backgroundColor: theme.colors.card }], componentId: 'navigation-map-container' },
        React.createElement(WebView, {
          source: { html: railMapHtml },
          originWhitelist: ['*'],
          style: styles.webviewMap,
          javaScriptEnabled: true,
          domStorageEnabled: true
        }),
        selectedRoute ? React.createElement(Text, { style: [styles.routeText, { color: theme.colors.primary }] }, 'Route to: ' + selectedRoute.name) : null
      );
    };
    // @end:NavigationScreen-MapView
  
    // @section:NavigationScreen @depends:[NavigationScreen-state,NavigationScreen-handlers,NavigationScreen-SearchResults,NavigationScreen-MapView,styles]
    const NavigationScreen = function() {
      const state = useNavigationState();
      const handlers = navigationHandlers;
      
      return React.createElement(View, { style: [styles.container, { backgroundColor: state.theme.colors.background }], componentId: 'navigation-screen' },
        React.createElement(ScrollView, {
          style: styles.scrollView,
          contentContainerStyle: { paddingBottom: Platform.OS === 'web' ? 90 : 100 }
        },
          React.createElement(View, { style: styles.header, componentId: 'navigation-header' },
            React.createElement(Text, { style: [styles.headerTitle, { color: state.theme.colors.textPrimary }] }, 'Station Navigation'),
            React.createElement(Text, { style: [styles.headerSubtitle, { color: state.theme.colors.textSecondary }] }, 'Find your way around the station')
          ),
          
          React.createElement(View, { style: [styles.searchContainer, { backgroundColor: state.theme.colors.card }], componentId: 'navigation-search-container' },
            React.createElement(View, { style: [styles.searchInputContainer, { borderColor: state.theme.colors.border }] },
              React.createElement(MaterialIcons, { name: 'search', size: 24, color: state.theme.colors.textSecondary }),
              React.createElement(TextInput, {
                style: [styles.searchInput, { color: state.theme.colors.textPrimary }],
                placeholder: 'Search platforms, facilities...',
                placeholderTextColor: state.theme.colors.textSecondary,
                value: state.searchQuery,
                onChangeText: function(text) { handlers.handleSearch(state, text); },
                componentId: 'navigation-search-input'
              })
            ),
            renderSearchResults(state.searchResults, function(item) { handlers.selectDestination(state, item); }, state.theme)
          ),
          
          renderMapView(state.selectedRoute, state.theme)
        )
      );
    };
    // @end:NavigationScreen
  
    // @section:StationAnalysisScreen-state @depends:[ThemeContext]
    const useStationAnalysisState = function() {
      const themeContext = useTheme();
      const theme = themeContext.theme;
      const currentStationState = useState({
        name: 'Central Railway Station',
        code: 'CRS',
        location: 'Downtown District',
        crowdLevel: 'Medium',
        peakHours: ['7:00-9:00 AM', '5:00-7:00 PM']
      });
      const currentStation = currentStationState[0];
      const setCurrentStation = currentStationState[1];
      
      const facilitiesState = useState([
        { id: '1', name: 'Platforms', count: 8, status: 'operational', icon: 'train' },
        { id: '2', name: 'Restrooms', count: 6, status: 'operational', icon: 'wc' },
        { id: '3', name: 'Food Courts', count: 3, status: 'operational', icon: 'restaurant' },
        { id: '4', name: 'ATMs', count: 4, status: 'operational', icon: 'local-atm' },
        { id: '5', name: 'Waiting Rooms', count: 2, status: 'operational', icon: 'event-seat' },
        { id: '6', name: 'Parking', count: 200, status: 'available', icon: 'local-parking' }
      ]);
      const facilities = facilitiesState[0];
      const setFacilities = facilitiesState[1];
      
      return { theme: theme, currentStation: currentStation, setCurrentStation: setCurrentStation, facilities: facilities, setFacilities: setFacilities };
    };
    // @end:StationAnalysisScreen-state
  
    // @section:StationAnalysisScreen-StationInfo @depends:[styles]
    const renderStationInfo = function(station, theme) {
      return React.createElement(View, { style: [styles.stationInfoCard, { backgroundColor: theme.colors.card }], componentId: 'station-info-card' },
        React.createElement(View, { style: styles.stationHeader },
          React.createElement(MaterialIcons, { name: 'location-on', size: 32, color: theme.colors.primary }),
          React.createElement(View, { style: styles.stationHeaderText },
            React.createElement(Text, { style: [styles.stationName, { color: theme.colors.textPrimary }] }, station.name),
            React.createElement(Text, { style: [styles.stationCode, { color: theme.colors.textSecondary }] }, station.code + ' • ' + station.location)
          )
        ),
        
        React.createElement(View, { style: styles.crowdInfo },
          React.createElement(View, { style: [styles.crowdIndicator, { backgroundColor: theme.colors.warning }] }),
          React.createElement(Text, { style: [styles.crowdText, { color: theme.colors.textPrimary }] }, 'Current Crowd: ' + station.crowdLevel),
          React.createElement(Text, { style: [styles.peakHoursText, { color: theme.colors.textSecondary }] }, 'Peak Hours: ' + station.peakHours.join(', '))
        )
      );
    };
    // @end:StationAnalysisScreen-StationInfo
  
    // @section:StationAnalysisScreen-FacilitiesList @depends:[styles]
    const renderFacilitiesList = function(facilities, theme) {
      return React.createElement(View, { style: [styles.facilitiesCard, { backgroundColor: theme.colors.card }], componentId: 'facilities-card' },
        React.createElement(Text, { style: [styles.facilitiesTitle, { color: theme.colors.textPrimary }] }, 'Station Facilities'),
        React.createElement(FlatList, {
          data: facilities,
          keyExtractor: function(item) { return item.id; },
          renderItem: function(itemData) {
            const facility = itemData.item;
            return React.createElement(View, { style: [styles.facilityItem, { borderBottomColor: theme.colors.border }], componentId: 'facility-' + facility.id },
              React.createElement(MaterialIcons, { name: facility.icon, size: 24, color: theme.colors.primary }),
              React.createElement(View, { style: styles.facilityInfo },
                React.createElement(Text, { style: [styles.facilityName, { color: theme.colors.textPrimary }] }, facility.name),
                React.createElement(Text, { style: [styles.facilityCount, { color: theme.colors.textSecondary }] }, facility.count + ' available')
              ),
              React.createElement(View, { style: [styles.statusBadge, { backgroundColor: facility.status === 'operational' ? theme.colors.success : theme.colors.warning }] },
                React.createElement(Text, { style: styles.statusText }, facility.status)
              )
            );
          }
        })
      );
    };
    // @end:StationAnalysisScreen-FacilitiesList
  
    // @section:StationAnalysisScreen @depends:[StationAnalysisScreen-state,StationAnalysisScreen-StationInfo,StationAnalysisScreen-FacilitiesList,styles]
    const StationAnalysisScreen = function() {
      const state = useStationAnalysisState();
      
      return React.createElement(View, { style: [styles.container, { backgroundColor: state.theme.colors.background }], componentId: 'station-analysis-screen' },
        React.createElement(ScrollView, {
          style: styles.scrollView,
          contentContainerStyle: { paddingBottom: Platform.OS === 'web' ? 90 : 100 }
        },
          React.createElement(View, { style: styles.header, componentId: 'analysis-header' },
            React.createElement(Text, { style: [styles.headerTitle, { color: state.theme.colors.textPrimary }] }, 'Station Analysis'),
            React.createElement(Text, { style: [styles.headerSubtitle, { color: state.theme.colors.textSecondary }] }, 'Current location and facilities')
          ),
          
          renderStationInfo(state.currentStation, state.theme),
          renderFacilitiesList(state.facilities, state.theme)
        )
      );
    };
    // @end:StationAnalysisScreen
  
    // @section:ChatbotScreen-state @depends:[ThemeContext]
    const useChatbotState = function() {
      const themeContext = useTheme();
      const theme = themeContext.theme;
      const messagesState = useState([
        { id: '1', text: 'Hello! I\'m your station assistant. How can I help you today?', isBot: true, timestamp: new Date() }
      ]);
      const messages = messagesState[0];
      const setMessages = messagesState[1];
      const inputTextState = useState('');
      const inputText = inputTextState[0];
      const setInputText = inputTextState[1];
      
      const quickQuestionsState = useState([
        'Where is Platform 3?',
        'What facilities are available?',
        'When is peak hour?',
        'Where can I find food?'
      ]);
      const quickQuestions = quickQuestionsState[0];
      const setQuickQuestions = quickQuestionsState[1];
      
      return { 
        theme: theme, 
        messages: messages, 
        setMessages: setMessages,
        inputText: inputText,
        setInputText: setInputText,
        quickQuestions: quickQuestions,
        setQuickQuestions: setQuickQuestions
      };
    };
    // @end:ChatbotScreen-state
  
    // @section:ChatbotScreen-handlers @depends:[ChatbotScreen-state]
    const chatbotHandlers = {
      sendMessage: function(state, messageText) {
        if (messageText.trim().length === 0) return;
        
        const userMessage = {
          id: Date.now().toString(),
          text: messageText,
          isBot: false,
          timestamp: new Date()
        };
        
        state.setMessages(function(prev) {
          return prev.concat([userMessage]);
        });
        
        state.setInputText('');
        
        setTimeout(function() {
          const botResponse = chatbotHandlers.getBotResponse(messageText);
          const botMessage = {
            id: (Date.now() + 1).toString(),
            text: botResponse,
            isBot: true,
            timestamp: new Date()
          };
          
          state.setMessages(function(prev) {
            return prev.concat([botMessage]);
          });
        }, 1000);
      },
      
      getBotResponse: function(userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        
        if (lowerMessage.indexOf('platform') !== -1) {
          return 'Platforms are located on the ground floor. Platform 1-4 are for express trains, Platform 5-8 are for local trains. Follow the blue signs for directions.';
        } else if (lowerMessage.indexOf('food') !== -1 || lowerMessage.indexOf('restaurant') !== -1) {
          return 'Food courts are available on Level 2. We have McDonald\'s, Subway, and local cuisine options. Operating hours: 6 AM to 10 PM.';
        } else if (lowerMessage.indexOf('restroom') !== -1 || lowerMessage.indexOf('bathroom') !== -1) {
          return 'Restrooms are available near each platform and on every level. The nearest one to you is near Platform 2, ground floor.';
        } else if (lowerMessage.indexOf('peak') !== -1 || lowerMessage.indexOf('rush') !== -1) {
          return 'Peak hours are 7:00-9:00 AM and 5:00-7:00 PM on weekdays. During these times, expect higher crowd levels and longer wait times.';
        } else if (lowerMessage.indexOf('parking') !== -1) {
          return 'Parking is available in the basement with 200 spaces. Rate is $2/hour. Electric vehicle charging stations are also available.';
        } else {
          return 'I can help you with directions, facilities, timings, and general station information. Try asking about platforms, food, restrooms, or peak hours!';
        }
      },
      
      selectQuickQuestion: function(state, question) {
        chatbotHandlers.sendMessage(state, question);
      }
    };
    // @end:ChatbotScreen-handlers
  
    // @section:ChatbotScreen-QuickQuestions @depends:[styles]
    const renderQuickQuestions = function(questions, onSelect, theme) {
      return React.createElement(View, { style: styles.quickQuestionsContainer, componentId: 'quick-questions-container' },
        React.createElement(Text, { style: [styles.quickQuestionsTitle, { color: theme.colors.textSecondary }] }, 'Quick Questions:'),
        React.createElement(ScrollView, {
          horizontal: true,
          showsHorizontalScrollIndicator: false,
          style: { flexGrow: 'initial' },
          contentContainerStyle: styles.quickQuestionsScroll
        },
          questions.map(function(question, index) {
            return React.createElement(TouchableOpacity, {
              key: index,
              style: [styles.quickQuestionButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }],
              onPress: function() { onSelect(question); },
              componentId: 'quick-question-' + index
            },
              React.createElement(Text, { style: [styles.quickQuestionText, { color: theme.colors.textPrimary }] }, question)
            );
          })
        )
      );
    };
    // @end:ChatbotScreen-QuickQuestions
  
    // @section:ChatbotScreen-MessagesList @depends:[styles]
    const renderMessagesList = function(messages, theme) {
      return React.createElement(FlatList, {
        data: messages,
        keyExtractor: function(item) { return item.id; },
        style: styles.messagesList,
        renderItem: function(itemData) {
          const message = itemData.item;
          return React.createElement(View, { 
            style: [styles.messageContainer, message.isBot ? styles.botMessage : styles.userMessage], 
            componentId: 'message-' + message.id 
          },
            React.createElement(View, { 
              style: [
                styles.messageBubble, 
                message.isBot ? { backgroundColor: theme.colors.card } : { backgroundColor: theme.colors.primary }
              ] 
            },
              React.createElement(Text, { 
                style: [
                  styles.messageText, 
                  { color: message.isBot ? theme.colors.textPrimary : '#FFFFFF' }
                ] 
              }, message.text)
            )
          );
        }
      });
    };
    // @end:ChatbotScreen-MessagesList
  
    // @section:ChatbotScreen @depends:[ChatbotScreen-state,ChatbotScreen-handlers,ChatbotScreen-QuickQuestions,ChatbotScreen-MessagesList,styles]
    const ChatbotScreen = function() {
      const state = useChatbotState();
      const handlers = chatbotHandlers;
      
      return React.createElement(View, { style: [styles.container, { backgroundColor: state.theme.colors.background }], componentId: 'chatbot-screen' },
        React.createElement(View, { style: styles.header, componentId: 'chatbot-header' },
          React.createElement(Text, { style: [styles.headerTitle, { color: state.theme.colors.textPrimary }] }, 'Station Assistant'),
          React.createElement(Text, { style: [styles.headerSubtitle, { color: state.theme.colors.textSecondary }] }, 'Ask me anything about the station')
        ),
        
        renderQuickQuestions(state.quickQuestions, function(question) { handlers.selectQuickQuestion(state, question); }, state.theme),
        
        renderMessagesList(state.messages, state.theme),
        
        React.createElement(KeyboardAvoidingView, {
          behavior: Platform.OS === 'ios' ? 'padding' : (Platform.OS === 'web' ? undefined : 'height'),
          style: [styles.inputContainer, { backgroundColor: state.theme.colors.card, borderTopColor: state.theme.colors.border }]
        },
          React.createElement(TextInput, {
            style: [styles.messageInput, { color: state.theme.colors.textPrimary, borderColor: state.theme.colors.border }],
            placeholder: 'Ask me about the station...',
            placeholderTextColor: state.theme.colors.textSecondary,
            value: state.inputText,
            onChangeText: state.setInputText,
            multiline: true,
            componentId: 'chatbot-input'
          }),
          React.createElement(TouchableOpacity, {
            style: [styles.sendButton, { backgroundColor: state.theme.colors.primary }],
            onPress: function() { handlers.sendMessage(state, state.inputText); },
            componentId: 'chatbot-send-button'
          },
            React.createElement(MaterialIcons, { name: 'send', size: 24, color: '#FFFFFF' })
          )
        )
      );
    };
    // @end:ChatbotScreen
  
    // @section:ProfileScreen-state @depends:[ThemeContext]
    const useProfileState = function() {
      const themeContext = useTheme();
      const theme = themeContext.theme;
      const isLoggedInState = useState(false);
      const isLoggedIn = isLoggedInState[0];
      const setIsLoggedIn = isLoggedInState[1];
      const showLoginModalState = useState(false);
      const showLoginModal = showLoginModalState[0];
      const setShowLoginModal = showLoginModalState[1];
      const showSignupModalState = useState(false);
      const showSignupModal = showSignupModalState[0];
      const setShowSignupModal = showSignupModalState[1];
      const userDataState = useState({
        name: 'Guest User',
        email: '',
        favoriteStations: []
      });
      const userData = userDataState[0];
      const setUserData = userDataState[1];
      const loginFormState = useState({ email: '', password: '' });
      const loginForm = loginFormState[0];
      const setLoginForm = loginFormState[1];
      const signupFormState = useState({ name: '', email: '', password: '' });
      const signupForm = signupFormState[0];
      const setSignupForm = signupFormState[1];
      
      return { 
        theme: theme, 
        isLoggedIn: isLoggedIn, 
        setIsLoggedIn: setIsLoggedIn,
        showLoginModal: showLoginModal,
        setShowLoginModal: setShowLoginModal,
        showSignupModal: showSignupModal,
        setShowSignupModal: setShowSignupModal,
        userData: userData,
        setUserData: setUserData,
        loginForm: loginForm,
        setLoginForm: setLoginForm,
        signupForm: signupForm,
        setSignupForm: setSignupForm
      };
    };
    // @end:ProfileScreen-state
  
    // @section:ProfileScreen-handlers @depends:[ProfileScreen-state]
    const profileHandlers = {
      handleLogin: function(state) {
        if (state.loginForm.email && state.loginForm.password) {
          state.setUserData({
            name: 'John Doe',
            email: state.loginForm.email,
            favoriteStations: ['Central Railway Station', 'North Terminal']
          });
          state.setIsLoggedIn(true);
          state.setShowLoginModal(false);
          state.setLoginForm({ email: '', password: '' });
          Platform.OS === 'web' ? window.alert('Successfully logged in!') : Alert.alert('Success', 'Successfully logged in!');
        } else {
          Platform.OS === 'web' ? window.alert('Please fill in all fields') : Alert.alert('Error', 'Please fill in all fields');
        }
      },
      
      handleSignup: function(state) {
        if (state.signupForm.name && state.signupForm.email && state.signupForm.password) {
          state.setUserData({
            name: state.signupForm.name,
            email: state.signupForm.email,
            favoriteStations: []
          });
          state.setIsLoggedIn(true);
          state.setShowSignupModal(false);
          state.setSignupForm({ name: '', email: '', password: '' });
          Platform.OS === 'web' ? window.alert('Account created successfully!') : Alert.alert('Success', 'Account created successfully!');
        } else {
          Platform.OS === 'web' ? window.alert('Please fill in all fields') : Alert.alert('Error', 'Please fill in all fields');
        }
      },
      
      handleLogout: function(state) {
        state.setIsLoggedIn(false);
        state.setUserData({
          name: 'Guest User',
          email: '',
          favoriteStations: []
        });
        Platform.OS === 'web' ? window.alert('Successfully logged out!') : Alert.alert('Success', 'Successfully logged out!');
      }
    };
    // @end:ProfileScreen-handlers
  
    // @section:ProfileScreen-LoginModal @depends:[styles]
    const renderLoginModal = function(visible, onClose, loginForm, setLoginForm, onLogin, theme) {
      return React.createElement(Modal, {
        visible: visible,
        animationType: 'slide',
        transparent: true,
        onRequestClose: onClose
      },
        React.createElement(View, { style: styles.modalOverlay, componentId: 'login-modal-overlay' },
          React.createElement(KeyboardAvoidingView, {
            behavior: Platform.OS === 'ios' ? 'padding' : (Platform.OS === 'web' ? undefined : 'height'),
            style: styles.modalKeyboardView
          },
            React.createElement(View, { style: [styles.modalContent, { backgroundColor: theme.colors.card }], componentId: 'login-modal-content' },
              React.createElement(View, { style: styles.modalHeader },
                React.createElement(Text, { style: [styles.modalTitle, { color: theme.colors.textPrimary }] }, 'Login'),
                React.createElement(TouchableOpacity, {
                  style: styles.modalCloseButton,
                  onPress: onClose,
                  componentId: 'login-modal-close'
                },
                  React.createElement(MaterialIcons, { name: 'close', size: 24, color: theme.colors.textSecondary })
                )
              ),
              
              React.createElement(View, { style: styles.formContainer },
                React.createElement(TextInput, {
                  style: [styles.formInput, { color: theme.colors.textPrimary, borderColor: theme.colors.border }],
                  placeholder: 'Email',
                  placeholderTextColor: theme.colors.textSecondary,
                  value: loginForm.email,
                  onChangeText: function(text) {
                    setLoginForm({ email: text, password: loginForm.password });
                  },
                  keyboardType: 'email-address',
                  componentId: 'login-email-input'
                }),
                React.createElement(TextInput, {
                  style: [styles.formInput, { color: theme.colors.textPrimary, borderColor: theme.colors.border }],
                  placeholder: 'Password',
                  placeholderTextColor: theme.colors.textSecondary,
                  value: loginForm.password,
                  onChangeText: function(text) {
                    setLoginForm({ email: loginForm.email, password: text });
                  },
                  secureTextEntry: true,
                  componentId: 'login-password-input'
                }),
                React.createElement(TouchableOpacity, {
                  style: [styles.primaryButton, { backgroundColor: theme.colors.primary }],
                  onPress: onLogin,
                  componentId: 'login-submit-button'
                },
                  React.createElement(Text, { style: styles.primaryButtonText }, 'Login')
                )
              )
            )
          )
        )
      );
    };
    // @end:ProfileScreen-LoginModal
  
    // @section:ProfileScreen-SignupModal @depends:[styles]
    const renderSignupModal = function(visible, onClose, signupForm, setSignupForm, onSignup, theme) {
      return React.createElement(Modal, {
        visible: visible,
        animationType: 'slide',
        transparent: true,
        onRequestClose: onClose
      },
        React.createElement(View, { style: styles.modalOverlay, componentId: 'signup-modal-overlay' },
          React.createElement(KeyboardAvoidingView, {
            behavior: Platform.OS === 'ios' ? 'padding' : (Platform.OS === 'web' ? undefined : 'height'),
            style: styles.modalKeyboardView
          },
            React.createElement(View, { style: [styles.modalContent, { backgroundColor: theme.colors.card }], componentId: 'signup-modal-content' },
              React.createElement(View, { style: styles.modalHeader },
                React.createElement(Text, { style: [styles.modalTitle, { color: theme.colors.textPrimary }] }, 'Sign Up'),
                React.createElement(TouchableOpacity, {
                  style: styles.modalCloseButton,
                  onPress: onClose,
                  componentId: 'signup-modal-close'
                },
                  React.createElement(MaterialIcons, { name: 'close', size: 24, color: theme.colors.textSecondary })
                )
              ),
              
              React.createElement(View, { style: styles.formContainer },
                React.createElement(TextInput, {
                  style: [styles.formInput, { color: theme.colors.textPrimary, borderColor: theme.colors.border }],
                  placeholder: 'Full Name',
                  placeholderTextColor: theme.colors.textSecondary,
                  value: signupForm.name,
                  onChangeText: function(text) {
                    setSignupForm({ name: text, email: signupForm.email, password: signupForm.password });
                  },
                  componentId: 'signup-name-input'
                }),
                React.createElement(TextInput, {
                  style: [styles.formInput, { color: theme.colors.textPrimary, borderColor: theme.colors.border }],
                  placeholder: 'Email',
                  placeholderTextColor: theme.colors.textSecondary,
                  value: signupForm.email,
                  onChangeText: function(text) {
                    setSignupForm({ name: signupForm.name, email: text, password: signupForm.password });
                  },
                  keyboardType: 'email-address',
                  componentId: 'signup-email-input'
                }),
                React.createElement(TextInput, {
                  style: [styles.formInput, { color: theme.colors.textPrimary, borderColor: theme.colors.border }],
                  placeholder: 'Password',
                  placeholderTextColor: theme.colors.textSecondary,
                  value: signupForm.password,
                  onChangeText: function(text) {
                    setSignupForm({ name: signupForm.name, email: signupForm.email, password: text });
                  },
                  secureTextEntry: true,
                  componentId: 'signup-password-input'
                }),
                React.createElement(TouchableOpacity, {
                  style: [styles.primaryButton, { backgroundColor: theme.colors.primary }],
                  onPress: onSignup,
                  componentId: 'signup-submit-button'
                },
                  React.createElement(Text, { style: styles.primaryButtonText }, 'Create Account')
                )
              )
            )
          )
        )
      );
    };
    // @end:ProfileScreen-SignupModal
  
    // @section:ProfileScreen-UserProfile @depends:[styles]
    const renderUserProfile = function(userData, onLogout, theme) {
      return React.createElement(View, { style: [styles.profileCard, { backgroundColor: theme.colors.card }], componentId: 'user-profile-card' },
        React.createElement(View, { style: styles.profileHeader },
          React.createElement(MaterialIcons, { name: 'account-circle', size: 48, color: theme.colors.primary }),
          React.createElement(View, { style: styles.profileInfo },
            React.createElement(Text, { style: [styles.profileName, { color: theme.colors.textPrimary }] }, userData.name),
            React.createElement(Text, { style: [styles.profileEmail, { color: theme.colors.textSecondary }] }, userData.email)
          )
        ),
        
        React.createElement(View, { style: styles.favoritesSection },
          React.createElement(Text, { style: [styles.favoritesTitle, { color: theme.colors.textPrimary }] }, 'Favorite Stations'),
          userData.favoriteStations.length > 0 ?
            userData.favoriteStations.map(function(station, index) {
              return React.createElement(View, { key: index, style: styles.favoriteItem, componentId: 'favorite-' + index },
                React.createElement(MaterialIcons, { name: 'star', size: 16, color: theme.colors.warning }),
                React.createElement(Text, { style: [styles.favoriteText, { color: theme.colors.textSecondary }] }, station)
              );
            }) :
            React.createElement(Text, { style: [styles.noFavoritesText, { color: theme.colors.textSecondary }] }, 'No favorite stations yet')
        ),
        
        React.createElement(TouchableOpacity, {
          style: [styles.logoutButton, { backgroundColor: theme.colors.error }],
          onPress: onLogout,
          componentId: 'logout-button'
        },
          React.createElement(Text, { style: styles.logoutButtonText }, 'Logout')
        )
      );
    };
    // @end:ProfileScreen-UserProfile
  
    // @section:ProfileScreen-GuestProfile @depends:[styles]
    const renderGuestProfile = function(onShowLogin, onShowSignup, theme) {
      return React.createElement(View, { style: [styles.guestCard, { backgroundColor: theme.colors.card }], componentId: 'guest-profile-card' },
        React.createElement(MaterialIcons, { name: 'account-circle', size: 64, color: theme.colors.textSecondary }),
        React.createElement(Text, { style: [styles.guestTitle, { color: theme.colors.textPrimary }] }, 'Welcome, Guest!'),
        React.createElement(Text, { style: [styles.guestSubtitle, { color: theme.colors.textSecondary }] }, 'You can use the app without logging in, or create an account for personalized features.'),
        
        React.createElement(View, { style: styles.authButtons },
          React.createElement(TouchableOpacity, {
            style: [styles.primaryButton, { backgroundColor: theme.colors.primary }],
            onPress: onShowLogin,
            componentId: 'show-login-button'
          },
            React.createElement(Text, { style: styles.primaryButtonText }, 'Login')
          ),
          React.createElement(TouchableOpacity, {
            style: [styles.secondaryButton, { borderColor: theme.colors.border }],
            onPress: onShowSignup,
            componentId: 'show-signup-button'
          },
            React.createElement(Text, { style: [styles.secondaryButtonText, { color: theme.colors.textPrimary }] }, 'Sign Up')
          )
        )
      );
    };
    // @end:ProfileScreen-GuestProfile
  
    // @section:ProfileScreen @depends:[ProfileScreen-state,ProfileScreen-handlers,ProfileScreen-LoginModal,ProfileScreen-SignupModal,ProfileScreen-UserProfile,ProfileScreen-GuestProfile,styles]
    const ProfileScreen = function() {
      const state = useProfileState();
      const handlers = profileHandlers;
      
      return React.createElement(View, { style: [styles.container, { backgroundColor: state.theme.colors.background }], componentId: 'profile-screen' },
        React.createElement(ScrollView, {
          style: styles.scrollView,
          contentContainerStyle: { paddingBottom: Platform.OS === 'web' ? 90 : 100 }
        },
          React.createElement(View, { style: styles.header, componentId: 'profile-header' },
            React.createElement(Text, { style: [styles.headerTitle, { color: state.theme.colors.textPrimary }] }, 'Profile'),
            React.createElement(Text, { style: [styles.headerSubtitle, { color: state.theme.colors.textSecondary }] }, 'Manage your account and preferences')
          ),
          
          state.isLoggedIn ? 
            renderUserProfile(state.userData, function() { handlers.handleLogout(state); }, state.theme) :
            renderGuestProfile(
              function() { state.setShowLoginModal(true); }, 
              function() { state.setShowSignupModal(true); }, 
              state.theme
            )
        ),
        
        renderLoginModal(
          state.showLoginModal,
          function() { state.setShowLoginModal(false); },
          state.loginForm,
          state.setLoginForm,
          function() { handlers.handleLogin(state); },
          state.theme
        ),
        
        renderSignupModal(
          state.showSignupModal,
          function() { state.setShowSignupModal(false); },
          state.signupForm,
          state.setSignupForm,
          function() { handlers.handleSignup(state); },
          state.theme
        )
      );
    };
    // @end:ProfileScreen
  
    // @section:TabNavigator @depends:[NavigationScreen,StationAnalysisScreen,ChatbotScreen,ProfileScreen,navigation-setup]
    const TabNavigator = function() {
      const themeContext = useTheme();
      const theme = themeContext.theme;
      
      return React.createElement(Tab.Navigator, {
        screenOptions: function(route) {
          return {
            tabBarIcon: function(iconProps) {
              let iconName;
              const focused = iconProps.focused;
              const color = iconProps.color;
              const size = iconProps.size;
              
              if (route.route.name === 'Navigation') {
                iconName = 'navigation';
              } else if (route.route.name === 'Analysis') {
                iconName = 'analytics';
              } else if (route.route.name === 'Chatbot') {
                iconName = 'chat';
              } else if (route.route.name === 'Profile') {
                iconName = 'person';
              }
              
              return React.createElement(MaterialIcons, { name: iconName, size: size, color: color });
            },
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: theme.colors.textSecondary,
            tabBarStyle: {
              backgroundColor: theme.colors.card,
              borderTopColor: theme.colors.border,
              position: 'absolute',
              bottom: 0
            },
            headerShown: false
          };
        }
      },
        React.createElement(Tab.Screen, {
          name: 'Navigation',
          component: NavigationScreen,
          options: { tabBarLabel: 'Navigate' }
        }),
        React.createElement(Tab.Screen, {
          name: 'Analysis',
          component: StationAnalysisScreen,
          options: { tabBarLabel: 'Station' }
        }),
        React.createElement(Tab.Screen, {
          name: 'Chatbot',
          component: ChatbotScreen,
          options: { tabBarLabel: 'Assistant' }
        }),
        React.createElement(Tab.Screen, {
          name: 'Profile',
          component: ProfileScreen,
          options: { tabBarLabel: 'Profile' }
        })
      );
    };
    // @end:TabNavigator
  
    // @section:styles @depends:[theme]
    const styles = StyleSheet.create({
      container: {
        flex: 1
      },
      scrollView: {
        flex: 1
      },
      header: {
        padding: 24,
        paddingTop: Platform.OS === 'ios' ? 60 : 40
      },
      headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8
      },
      headerSubtitle: {
        fontSize: 16
      },
      
      // Navigation Screen
      searchContainer: {
        margin: 16,
        borderRadius: 12,
        padding: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4
      },
      searchInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8
      },
      searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 16
      },
      searchResults: {
        marginTop: 12,
        borderRadius: 8,
        maxHeight: 200
      },
      searchResultItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1
      },
      searchResultContent: {
        flexDirection: 'row',
        alignItems: 'center'
      },
      searchResultText: {
        marginLeft: 12,
        flex: 1
      },
      searchResultName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4
      },
      searchResultDescription: {
        fontSize: 14
      },
      mapContainer: {
        margin: 16,
        borderRadius: 12,
        overflow: 'hidden',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4
      },
      webviewMap: {
        height: 300,
        width: '100%'
      },
      routeText: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 8,
        textAlign: 'center'
      },
      
      // Station Analysis Screen
      stationInfoCard: {
        margin: 16,
        padding: 20,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4
      },
      stationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16
      },
      stationHeaderText: {
        marginLeft: 12,
        flex: 1
      },
      stationName: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 4
      },
      stationCode: {
        fontSize: 14
      },
      crowdInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap'
      },
      crowdIndicator: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 8
      },
      crowdText: {
        fontSize: 16,
        fontWeight: '600',
        marginRight: 16,
        marginBottom: 4
      },
      peakHoursText: {
        fontSize: 14,
        marginBottom: 4
      },
      facilitiesCard: {
        margin: 16,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4
      },
      facilitiesTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        padding: 16,
        paddingBottom: 8
      },
      facilityItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1
      },
      facilityInfo: {
        marginLeft: 12,
        flex: 1
      },
      facilityName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4
      },
      facilityCount: {
        fontSize: 14
      },
      statusBadge: {
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 12
      },
      statusText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase'
      },
      
      // Chatbot Screen
      quickQuestionsContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12
      },
      quickQuestionsTitle: {
        fontSize: 14,
        marginBottom: 8,
        fontWeight: '500'
      },
      quickQuestionsScroll: {
        paddingRight: 16
      },
      quickQuestionButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        marginRight: 8
      },
      quickQuestionText: {
        fontSize: 14
      },
      messagesList: {
        flex: 1,
        paddingHorizontal: 16
      },
      messageContainer: {
        marginBottom: 12
      },
      botMessage: {
        alignSelf: 'flex-start',
        maxWidth: '80%'
      },
      userMessage: {
        alignSelf: 'flex-end',
        maxWidth: '80%'
      },
      messageBubble: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2
      },
      messageText: {
        fontSize: 16,
        lineHeight: 20
      },
      inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        paddingBottom: Platform.OS === 'web' ? 12 : 32
      },
      messageInput: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginRight: 8,
        maxHeight: 100,
        fontSize: 16
      },
      sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4
      },
      
      // Profile Screen
      profileCard: {
        margin: 16,
        padding: 20,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4
      },
      profileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20
      },
      profileInfo: {
        marginLeft: 16,
        flex: 1
      },
      profileName: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 4
      },
      profileEmail: {
        fontSize: 16
      },
      favoritesSection: {
        marginBottom: 20
      },
      favoritesTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 12
      },
      favoriteItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8
      },
      favoriteText: {
        fontSize: 14,
        marginLeft: 8
      },
      noFavoritesText: {
        fontSize: 14,
        fontStyle: 'italic'
      },
      logoutButton: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        alignItems: 'center'
      },
      logoutButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600'
      },
      guestCard: {
        margin: 16,
        padding: 32,
        borderRadius: 12,
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4
      },
      guestTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginTop: 16,
        marginBottom: 8
      },
      guestSubtitle: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22
      },
      authButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%'
      },
      primaryButton: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 8,
        alignItems: 'center',
        minWidth: 120,
        marginHorizontal: 8
      },
      primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600'
      },
      secondaryButton: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
        minWidth: 120,
        marginHorizontal: 8
      },
      secondaryButtonText: {
        fontSize: 16,
        fontWeight: '600'
      },
      
      // Modal Styles
      modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center'
      },
      modalKeyboardView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%'
      },
      modalContent: {
        width: '90%',
        maxWidth: 400,
        borderRadius: 12,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8
      },
      modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16
      },
      modalTitle: {
        fontSize: 20,
        fontWeight: 'bold'
      },
      modalCloseButton: {
        padding: 4
      },
      formContainer: {
        paddingHorizontal: 20,
        paddingBottom: 20
      },
      formInput: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 16,
        fontSize: 16
      }
    });
    // @end:styles
  
    // @section:return @depends:[ThemeProvider,TabNavigator]
    return React.createElement(NavigationContainer, null,
        React.createElement(ThemeProvider, null,
          React.createElement(View, { style: { flex: 1, width: '100%', height: '100%', overflow: 'hidden' } },
            React.createElement(StatusBar, { barStyle: 'dark-content' }),
            React.createElement(TabNavigator)
          )
        )
      );
    // @end:return
  };
  export default ComponentFunction;