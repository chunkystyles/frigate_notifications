import fs from 'fs';
import fetch from 'node-fetch';
import yaml from 'yaml';
import {createLogger, format, transports} from 'winston';
import mqtt from 'mqtt';

let config;
let logger;
let secrets;
let mqttClient;
let lastNotificationDate;

async function initialize() {
  let configLoadedFromVolume = true;
  let configFile;
  try {
    configFile = fs.readFileSync('./config/config.yml', 'utf-8');
  } catch (e) {
    configLoadedFromVolume = false;
    configFile = fs.readFileSync('./config.yml', 'utf-8');
  }
  config = yaml.parse(configFile);
  try {
    initializeLogger('./config/app.log');
  } catch (e) {
    initializeLogger('app.log');
  }
  if (!configLoadedFromVolume) {
    logger.info('config.yml not found in volume.  Using bundled file.');
  }
  let secretsFile;
  try {
    secretsFile = fs.readFileSync('./config/secrets.yml', 'utf-8');
  } catch (e) {
    logger.info('secrets.yml not found in volume.  Using bundled file.');
    secretsFile = fs.readFileSync('./secrets.yml', 'utf-8');
  }
  secrets = yaml.parse(secretsFile);
  mqttClient = mqtt.connect(secrets.mqtt.address);
  mqttClient.on('connect', options => {
    mqttClient.subscribe([config.frigate.mqtt.topic], () => {
      logger.info(`Subscribed to topic '${config.frigate.mqtt.topic}'`);
    });
  });
  mqttClient.on('message', (topic, payload) => {
    const event = JSON.parse(payload.toString());
    const before = event.before;
    const after = event.after;
    const type = event.type;
    if (type === 'new') {
      if (before && before.has_snapshot) {
        sendFrigateNotification(before.camera, before.label, before.id);
      } else if (after && after.has_snapshot) {
        sendFrigateNotification(after.camera, after.label, after.id);
      }
    }
  });
}

function initializeLogger(path) {
  logger = createLogger({
    format: format.combine(
        format.timestamp({format: () => new Date().toLocaleString('en-US', {timeZone: config.logger.timezone})}),
        format.json()
    ),
    transports: [new transports.File({filename: path})],
    exceptionHandlers: [new transports.File({filename: path})],
    rejectionHandlers: [new transports.File({filename: path})]
  });
}

function sendFrigateNotification(camera, label, id) {
  let priority = '3';
  if (config.ntfy.grouping.enabled) {
    const now = new Date();
    if (lastNotificationDate) {
      const diff = now - lastNotificationDate
      const diffMinutes = Math.floor(diff / 60000);
      if (diffMinutes >= config.ntfy.grouping.minutes) {
        lastNotificationDate = now;
      } else {
        priority = '2';
      }
    } else {
      lastNotificationDate = now;
    }
  }
  const options = {
    method: 'POST',
    headers: {
      'Title': capitalizeFirstLetter(label),
      'Attach': `${secrets.frigate.url}/api/events/${id}/snapshot.jpg${formatSnapshotOptions()}`,
      'Click': `${secrets.frigate.url}/api/events/${id}/clip.mp4`,
      'Tags': config.ntfy.tags[label],
      'Priority': priority,
    },
    body: capitalizeFirstLetter(camera)
  };
  fetch(`${secrets.ntfy.url}/${config.ntfy.topic}`, options)
      .then()
      .catch(error => console.error('Error:', error));
}

function formatSnapshotOptions() {
  return config.frigate.snapshot.options ?
      '?' + Object.entries(config.frigate.snapshot.options)
          .map(([key, value]) => `${key}=${value}`)
          .join('&') :
      '';
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

initialize().then();
