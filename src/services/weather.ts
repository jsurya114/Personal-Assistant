// ============================================
// Ultron AI — Weather Service (OpenWeatherMap)
// ============================================

import axios from 'axios';
import { WeatherData } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';

export async function getWeather(): Promise<WeatherData | null> {
  if (!config.services.weatherApiKey) {
    logger.warn('Weather: OPENWEATHER_API_KEY not set');
    return null;
  }

  try {
    const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: {
        q: `${config.services.weatherCity},${config.services.weatherCountry}`,
        appid: config.services.weatherApiKey,
        units: 'metric',
      },
      timeout: 10000,
    });

    const data = response.data;
    const sunrise = new Date(data.sys.sunrise * 1000).toLocaleTimeString('en-IN', { hour12: true, hour: '2-digit', minute: '2-digit' });
    const sunset = new Date(data.sys.sunset * 1000).toLocaleTimeString('en-IN', { hour12: true, hour: '2-digit', minute: '2-digit' });

    return {
      city: data.name,
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed * 3.6), // m/s to km/h
      description: data.weather[0].description,
      rainChance: data.rain ? Math.round((data.rain['1h'] || 0) * 100) : 0,
      sunrise,
      sunset,
      icon: data.weather[0].icon,
    };
  } catch (error) {
    logger.error('Weather service error:', error);
    return null;
  }
}

export function formatWeatherSummary(weather: WeatherData): string {
  return `🌡️ ${weather.temperature}°C (feels like ${weather.feelsLike}°C) | ${weather.description} | 💧 ${weather.humidity}% humidity | 🌬️ ${weather.windSpeed} km/h | 🌅 ${weather.sunrise} → 🌇 ${weather.sunset}`;
}
