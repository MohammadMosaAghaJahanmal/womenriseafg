import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rmdir } from 'node:fs/promises';
import { get, type OutgoingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Router } from 'express';
import pino from 'pino';
import { createApp } from '../src/app';
import { requireSecureTransport } from '../src/modules/auth/request';

const gatewayHeaders = {
  host: 'learning.example.test',
  '!~Passenger-Proto': 'https',
  '!~Passenger-Client-Address': '203.0.113.10',
};

async function openTransport(passenger: boolean, socket: boolean, trustedProxies: string[] = []) {
  const useNamedPipe = socket && process.platform === 'win32';
  const directory = socket && !useNamedPipe ? await mkdtemp(path.join(tmpdir(), 'wra-transport-')) : undefined;
  const socketPath = useNamedPipe ? '\\\\.\\pipe\\wra-transport-' + randomUUID()
    : directory ? path.join(directory, 'app.sock') : undefined;
  const router = Router().get('/transport-fixture', requireSecureTransport(true), (request, response) => {
    response.json({ protocol: request.protocol, address: request.ip, host: request.hostname });
  });
  const app = createApp({
    production: true,
    logger: pino({ level: 'silent' }),
    checkDatabase: async () => {},
    identityRoutes: router,
    passengerSocket: passenger ? () => typeof server.address() === 'string' : undefined,
    trustedProxies,
  });
  const server: Server = socketPath ? app.listen(socketPath) : app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  function fetchTransport(headers: OutgoingHttpHeaders) {
    const connection = socketPath ? { socketPath } : { hostname: '127.0.0.1', port: (server.address() as AddressInfo).port };
    return new Promise<{ status?: number; body: Record<string, unknown> }>((resolve, reject) => {
      const request = get({ ...connection, path: '/api/v1/transport-fixture', headers, agent: false }, response => {
        let body = '';
        response.setEncoding('utf8').on('data', chunk => { body += chunk; });
        response.once('error', reject);
        response.once('end', () => {
          try {
            resolve({ status: response.statusCode, body: JSON.parse(body) });
          } catch (error) {
            reject(error);
          }
        });
      });
      request.once('error', reject);
    });
  }

  async function close() {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (directory) await rmdir(directory);
  }
  return { fetchTransport, close };
}

test('Passenger uses authenticated HTTPS and the client address on its IPC listener', async () => {
  const fixture = await openTransport(true, true, ['127.0.0.1']);
  try {
    const ordinaryForwarding = {
      'x-forwarded-proto': 'http',
      'x-forwarded-for': '192.0.2.22',
      'x-forwarded-host': 'forwarded.example.test',
      forwarded: 'for=192.0.2.22;proto=http',
    };
    for (const address of ['203.0.113.10', '2001:db8::34']) {
      const response = await fixture.fetchTransport({
        ...gatewayHeaders, ...ordinaryForwarding, '!~Passenger-Client-Address': address,
      });
      assert.deepEqual(response, {
        status: 200, body: { protocol: 'https', address, host: 'learning.example.test' },
      });
    }
    for (const headers of [
      { 'x-forwarded-proto': 'https', 'x-forwarded-for': '192.0.2.22' },
      { '!~Passenger-Proto': 'https' },
      { ...gatewayHeaders, '!~Passenger-Client-Address': 'client.example.test' },
      { ...gatewayHeaders, '!~Passenger-Client-Address': ['203.0.113.10', '203.0.113.11'] },
      { ...gatewayHeaders, '!~Passenger-Proto': 'http' },
      { ...gatewayHeaders, '!~Passenger-Proto': ['https', 'http'] },
    ]) {
      assert.equal((await fixture.fetchTransport(headers)).status, 400);
    }
  } finally {
    await fixture.close();
  }
});

test('Passenger headers require both the loader mode and an IPC listener', async () => {
  for (const [passenger, socket] of [[true, false], [false, true]] as const) {
    const fixture = await openTransport(passenger, socket);
    try {
      assert.equal((await fixture.fetchTransport(gatewayHeaders)).status, 400);
    } finally {
      await fixture.close();
    }
  }
});

test('an explicitly trusted TCP proxy still supplies HTTPS and client address', async () => {
  const fixture = await openTransport(false, false, ['127.0.0.1']);
  try {
    const response = await fixture.fetchTransport({
      host: gatewayHeaders.host,
      'x-forwarded-proto': 'https',
      'x-forwarded-for': '192.0.2.22',
    });
    assert.deepEqual(response, {
      status: 200, body: { protocol: 'https', address: '192.0.2.22', host: 'learning.example.test' },
    });
  } finally {
    await fixture.close();
  }
});

