// Dashboard initialization function
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard loaded successfully');
    console.log(`Browser timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    console.log(`Current browser time: ${new Date().toLocaleString('en-US')}`);
    
    // Load initial data
    fetchSessionData();
    
    // Initialize charts
    initializeCharts();
    
    // Set 5 minute interval for updates
    setInterval(() => {
        fetchSessionData();
        updateCharts();
    }, 2700000);

    updateBadgeLimits();
    
    // Manual refresh button
    document.getElementById('refreshButton').addEventListener('click', function() {
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Loading...</span>';
        
        Promise.all([
            fetchSessionData(),
            updateCharts()
        ]).finally(() => {
            setTimeout(() => {
                this.disabled = false;
                this.innerHTML = '<i class="fas fa-sync-alt"></i> <span>Refresh</span>';
            }, 1000);
        });
    });
});

// License limits for each badge type
const licenseLimits = {
    ERPDEV: 2,
    ERPFULL: 23,
    ERPDIS: 32,
    ERPFIN: 7,
    ERPTRAN: 10
}

// Global variable for charts
const charts = {};

// Format time for chart labels (hour only for x-axis)
function formatHourLabel(date) {
    // Display hour with leading zero for better alignment
    const hour = date.getHours().toString().padStart(2, '0');
    return `${hour}:00`;
}

// Initialize charts function
function initializeCharts() {
    console.log('Initializing charts');
    const badges = ['ERPDEV', 'ERPDIS', 'ERPFIN', 'ERPFULL', 'ERPTRAN'];
    const colors = {
        ERPDEV: {
            border: 'rgb(79, 70, 229)',
            background: 'rgba(79, 70, 229, 0.1)'
        },
        ERPDIS: {
            border: 'rgb(16, 185, 129)',
            background: 'rgba(16, 185, 129, 0.1)'
        },
        ERPFIN: {
            border: 'rgb(59, 130, 246)',
            background: 'rgba(59, 130, 246, 0.1)'
        },
        ERPFULL: {
            border: 'rgb(139, 92, 246)',
            background: 'rgba(139, 92, 246, 0.1)'
        },
        ERPTRAN: {
            border: 'rgb(220, 38, 38)',
            background: 'rgba(220, 38, 38, 0.1)'
        }
    };

    badges.forEach(badge => {
        const canvas = document.getElementById(`chart-${badge}`);
        if (!canvas) {
            console.error(`Canvas element not found for badge: chart-${badge}`);
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error(`Could not get 2D context for badge: ${badge}`);
            return;
        }
        
        console.log(`Creating chart for ${badge}`);
        
        // Default Y-axis configuration untuk semua chart
        let yAxisConfig = {
            beginAtZero: true,
            suggestedMax: licenseLimits[badge],
            max: undefined,
            title: {
                display: true,
                text: 'License Count'
            },
            ticks: {
                stepSize: 1
            }
        };

        // Special configuration HANYA untuk ERPFULL - custom tick marks
        if (badge === 'ERPFULL') {
            yAxisConfig = {
                beginAtZero: true,
                min: 0,
                max: 23,
                title: {
                    display: true,
                    text: 'License Count'
                },
                ticks: {
                    stepSize: 3, // Ini akan membuat 0, 3, 6, 9, 12, 15, 18, 21
                    callback: function(value, index, values) {
                        // Custom tick values: 0, 3, 6, 9, 12, 15, 18, 21, 23
                        const customTicks = [0, 3, 6, 9, 12, 15, 18, 21, 23];
                        if (customTicks.includes(value)) {
                            return value;
                        }
                        return null; // Sembunyikan tick yang tidak diinginkan
                    }
                }
            };
        }
        
        // Create empty chart initially
        charts[badge] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: `${badge} Licenses`,
                    data: [],
                    borderColor: colors[badge].border,
                    backgroundColor: colors[badge].background,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: colors[badge].border,
                    fill: true,
                    tension: 0.2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            title: function(tooltipItems) {
                                const item = tooltipItems[0];
                                if (!item) return '';

                                const dataIndex = item.dataIndex;
                                const timestamp = charts[badge].timestamps ?
                                    charts[badge].timestamps[dataIndex] : null;

                                if (timestamp) {
                                    return timestamp.toLocaleString('en-US', {
                                        year: 'numeric',
                                        month: 'numeric',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: false
                                    });
                                }
                                return item.label;
                            }
                        }
                    },
                    annotation: {
                        annotations: {
                            limitLine: {
                                type: 'line',
                                yMin: licenseLimits[badge],
                                yMax: licenseLimits[badge],
                                borderColor: 'rgba(255, 99, 132, 0.8)',
                                borderWidth: 2,
                            }
                        }
                    }
                },
                scales: {
                    y: yAxisConfig,
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            autoSkip: false,
                            callback: function(val, index) {
                                return this.getLabelForValue(val);
                            }
                        }
                    }
                }
            }
        });
        
        charts[badge].timestamps = [];
    });
    
    updateCharts();
    
    console.log('Charts initialized');
}


function updateBadgeLimits() {
    document.querySelectorAll('.badge-limit').forEach(el => {
        const badge = el.getAttribute('data-badge');
        if (licenseLimits[badge] !== undefined) {
            el.textContent = `Limit ${licenseLimits[badge]}`;
        } else {
            el.textContent = 'Limit -';
        }
    });
}


function generate24HourTimeline() {
    const now = new Date();
    const timeline = [];
    
    // Generate 24 hourly points
    for (let i = 24; i >= 0; i--) {
        const hourPoint = new Date(now);
        hourPoint.setHours(now.getHours() - i);
        hourPoint.setMinutes(0);
        hourPoint.setSeconds(0);
        hourPoint.setMilliseconds(0);
        
        timeline.push(hourPoint);
    }
    
    return timeline;
}

// Update charts with real data from the API
function updateCharts() {
    console.log('Updating charts for last 24 hours');
    
    // Always fetch 24 hours of data
    return fetchLicenseHistory(24)
        .then(data => {
            if (data && data.length > 0) {
                processAndUpdateCharts(data);
                return data;
            } else {
                console.warn('No license history data available, using simulated data');
                return generateSimulatedData();
            }
        })
        .catch(error => {
            console.error('Error updating charts:', error);
            showErrorMessage('Failed to fetch license history data. Using simulated data temporarily.');
            return generateSimulatedData();
        });
}

// Process and update charts with real data - uses consistent hourly buckets
function processAndUpdateCharts(data) {
    const badges = ['ERPDEV', 'ERPDIS', 'ERPFIN', 'ERPFULL', 'ERPTRAN'];
    
    // Generate timeline with consistent hourly points
    const hourlyTimeline = generate24HourTimeline();
    
    // Create a map to hold aggregated data for each badge and hour
    const hourlyData = {};
    
    // Initialize hourly data structure for all badges
    badges.forEach(badge => {
        hourlyData[badge] = {};
        
        // Initialize each hour with null (no data)
        hourlyTimeline.forEach(timePoint => {
            const hourKey = timePoint.toISOString();
            hourlyData[badge][hourKey] = {
                timestamp: timePoint,
                count: 0,      // Default value
                hasData: false // Flag to track if we actually have data for this hour
            };
        });
    });
    
    // Process raw data into hourly buckets
    data.forEach(item => {
        const badge = item.badge;
        const timestamp = new Date(item.timestamp);
        const licenseCount = item.licenseCount;
        
        if (!badges.includes(badge)) return;
        
        // Find the correct hour bucket by truncating to the hour
        const hourTimestamp = new Date(timestamp);
        hourTimestamp.setMinutes(0);
        hourTimestamp.setSeconds(0);
        hourTimestamp.setMilliseconds(0);
        
        const hourKey = hourTimestamp.toISOString();
        
        // If this hour exists in our timeline, update it
        if (hourlyData[badge][hourKey]) {
            hourlyData[badge][hourKey].count = licenseCount;
            hourlyData[badge][hourKey].hasData = true;
        }
    });
    
    // Update charts with the hourly data
    badges.forEach(badge => {
        if (!charts[badge]) return;
        
        // Extract data in timeline order
        const values = [];
        const timestamps = [];
        
        hourlyTimeline.forEach(timePoint => {
            const hourKey = timePoint.toISOString();
            const hourData = hourlyData[badge][hourKey];
            
            // Use either actual data or continue the previous value
            if (hourData.hasData) {
                values.push(hourData.count);
            } else {
                // For gaps, use the last known value or 0
                const lastValue = values.length > 0 ? values[values.length - 1] : 0;
                values.push(lastValue);
            }
            
            timestamps.push(timePoint);
        });
        
        // Create labels from timestamps (hour only)
        const labels = timestamps.map(ts => formatHourLabel(ts));
        
        // Store timestamps for tooltip use
        charts[badge].timestamps = timestamps;
        
        // Update chart data
        charts[badge].data.labels = labels;
        charts[badge].data.datasets[0].data = values;
        charts[badge].update();
    });
}

// Generate simulated data with consistent hourly intervals
function generateSimulatedData() {
    const badges = ['ERPDEV', 'ERPDIS', 'ERPFIN', 'ERPFULL', 'ERPTRAN'];
    const hourlyTimeline = generate24HourTimeline();
    const result = [];
    
    console.log('Generating simulated data with consistent hourly intervals');
    
    // Generate data points for each hour in the timeline
    hourlyTimeline.forEach(timestamp => {
        badges.forEach(badge => {
            // Generate realistic values
            let value = 0;
            const hourOfDay = timestamp.getHours();
            
            if (hourOfDay >= 8 && hourOfDay <= 17) {
                // Work hours - higher values
                value = Math.floor(Math.random() * Math.min(5, licenseLimits[badge]));
                
                // For ERPFULL, simulate heavier usage during work hours
                if (badge === 'ERPFULL' && hourOfDay >= 9 && hourOfDay <= 16) {
                    value = Math.max(12, Math.floor(Math.random() * licenseLimits[badge]));
                }
                
                // For ERPDIS, simulate high distribution activity
                if (badge === 'ERPDIS' && hourOfDay >= 9 && hourOfDay <= 16) {
                    value = Math.max(15, Math.floor(Math.random() * licenseLimits[badge]));
                }
                
                // For ERPTRAN, ensure at least one license during work hours
                if (badge === 'ERPTRAN' && hourOfDay >= 9 && hourOfDay <= 16) {
                    value = Math.max(1, value);
                }
            } else {
                // Non-work hours - mostly zeros or very low values
                value = Math.random() < 0.8 ? 0 : 1;
            }
            
            result.push({
                badge: badge,
                licenseCount: value,
                timestamp: new Date(timestamp)
            });
        });
    });
    
    if (result.length > 0) {
        console.log('Simulated data generated with consistent hourly intervals.');
    }
    
    processAndUpdateCharts(result);
    return result;
}

// Function to fetch session data from server
function fetchSessionData() {
    console.log('Fetching session data');
    return fetch('/api/sessions')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Session data received:', data);
            updateDashboard(data);
            return data;
        })
        .catch(error => {
            console.error('Error fetching session data:', error);
            showErrorMessage('Failed to fetch session data. Please try again later.');
            return [];
        });
}

// Function to fetch license history data
function fetchLicenseHistory(hours = 24) {
    console.log(`Fetching license history for ${hours} hours at ${new Date().toLocaleString('en-US')}`);
    return fetch(`/api/license-history?hours=${hours}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log(`License history data received: ${data.length} records`);
            // Debugging: Log a few records to see their format
            if (data.length > 0) {
                console.log('Sample records:', data.slice(0, 3));
                console.log('First timestamp parsed as:', new Date(data[0].timestamp).toLocaleString('en-US'));
                console.log('Last timestamp parsed as:', new Date(data[data.length-1].timestamp).toLocaleString('en-US'));
            }
            return data;
        })
        .catch(error => {
            console.error('Error fetching license history:', error);
            showErrorMessage('Failed to fetch license history data. Using simulated data temporarily.');
            return [];
        });
}

// Function to update dashboard with new data
function updateDashboard(data) {
    let totalLicenses = 0;

    data.forEach(item => {
        const badge = item.Badge;
        const usedLicenses = parseInt(item.License);
        const maxLicenses = licenseLimits[badge] || 0;

        totalLicenses += usedLicenses;

        const cardElement = document.getElementById(`card-${badge}`);
        if (cardElement) {
            const licenseCountElement = cardElement.querySelector('.license-count');
            if (licenseCountElement) {
                const oldText = licenseCountElement.textContent;
                const oldValue = parseInt(oldText.split('/')[0]) || 0;

                if (oldValue !== usedLicenses) {
                    if (usedLicenses > oldValue) {
                        licenseCountElement.classList.add('text-green-600');
                    } else if (usedLicenses < oldValue) {
                        licenseCountElement.classList.add('text-red-600');
                    }

                    // Update display with x/y
                    licenseCountElement.textContent = `${usedLicenses}/${maxLicenses}`;

                    setTimeout(() => {
                        licenseCountElement.classList.remove('text-green-600');
                        licenseCountElement.classList.remove('text-red-600');
                    }, 1500);
                }
            }
        }
    });

    // Update total licenses
    document.getElementById('totalLicenses').textContent = totalLicenses + "/74";

    // Update timestamp in consistent format
    const now = new Date();
    document.getElementById('lastUpdate').textContent = now.toLocaleString('en-US', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const lastUpdateContainer = document.getElementById('lastUpdateContainer');
    lastUpdateContainer.classList.add('bg-green-50');
    setTimeout(() => {
        lastUpdateContainer.classList.remove('bg-green-50');
    }, 1000);
}

// Function to display error messages
function showErrorMessage(message) {
    console.error('Error:', message);
    
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-lg z-50';
    toast.innerHTML = `
        <div class="flex">
            <div class="flex-shrink-0">
                <i class="fas fa-exclamation-circle"></i>
            </div>
            <div class="ml-3">
                <p class="text-sm">${message}</p>
            </div>
            <div class="ml-auto pl-3">
                <button type="button" class="inline-flex text-red-500 focus:outline-none">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Remove toast after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
    
    // Close button
    const closeButton = toast.querySelector('button');
    closeButton.addEventListener('click', () => {
        toast.remove();
    });
}