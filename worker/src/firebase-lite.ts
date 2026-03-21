// No external crypto libraries needed, using native WebCrypto

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

export class FirebaseLite {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private serviceAccount: ServiceAccount) {}

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;

    const payload = {
      iss: this.serviceAccount.client_email,
      sub: this.serviceAccount.client_email,
      aud: this.serviceAccount.token_uri,
      iat,
      exp,
      scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
    };

    const header = { alg: 'RS256', typ: 'JWT' };
    const encodedHeader = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    // Format the private key for WebCrypto
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = this.serviceAccount.private_key.substring(
      this.serviceAccount.private_key.indexOf(pemHeader) + pemHeader.length,
      this.serviceAccount.private_key.indexOf(pemFooter)
    ).replace(/\s/g, '');
    
    // Decode base64 to ArrayBuffer
    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
      binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    // Import Key
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryDer.buffer,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" },
      },
      false,
      ["sign"]
    );

    // Sign
    const encoder = new TextEncoder();
    const dataToSign = encoder.encode(unsignedToken);
    const signatureBuffer = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      dataToSign
    );

    // Encode signature
    const signatureBytes = new Uint8Array(signatureBuffer);
    let signatureStr = "";
    for (let i = 0; i < signatureBytes.byteLength; i++) {
        signatureStr += String.fromCharCode(signatureBytes[i]);
    }
    const encodedSignature = btoa(signatureStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const token = `${unsignedToken}.${encodedSignature}`;

    const response = await fetch(this.serviceAccount.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: token,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get access token: ${error}`);
    }

    const data: any = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken!;
  }

  async firestoreRequest(path: string, options: RequestInit = {}): Promise<any> {
    const token = await this.getAccessToken();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `https://firestore.googleapis.com/v1/projects/${this.serviceAccount.project_id}/databases/(default)/documents${cleanPath}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
        const error = await response.text();
        console.error(`Firestore error on ${url}:`, error);
        throw new Error(`Firestore error ${response.status}: ${error}`);
    }

    return await response.json();
  }

  // Simplified Firestore helpers
  async getDocument(path: string): Promise<any> {
    try {
      const data = await this.firestoreRequest(path);
      if (!data) return null;
      return this.simplifyFirestoreObject(data);
    } catch (e: any) {
      if (e.message.includes('404') || e.message.includes('NOT_FOUND')) {
        return null; // Document not found is fine
      }
      throw e;
    }
  }

  async listDocuments(collection: string): Promise<any[]> {
    const data = await this.firestoreRequest(collection);
    if (!data || !data.documents) return [];
    return data.documents.map((doc: any) => ({
        id: doc.name.split('/').pop(),
        ...this.simplifyFirestoreObject(doc)
    }));
  }

  async patchDocument(path: string, fields: any): Promise<any> {
      const body = {
          fields: this.encodeFirestoreFields(fields)
      };
      const queryParams = new URLSearchParams();
      Object.keys(fields).forEach(key => queryParams.append('updateMask.fieldPaths', key));

      return await this.firestoreRequest(`${path}?${queryParams.toString()}`, {
          method: 'PATCH',
          body: JSON.stringify(body)
      });
  }

  async createDocument(collection: string, fields: any, documentId?: string): Promise<any> {
      const body = {
          fields: this.encodeFirestoreFields(fields)
      };
      let url = collection;
      if (documentId) {
          url += `?documentId=${documentId}`;
      }
      return await this.firestoreRequest(url, {
          method: 'POST',
          body: JSON.stringify(body)
      });
  }

  async deleteDocument(path: string): Promise<any> {
      return await this.firestoreRequest(path, {
          method: 'DELETE'
      });
  }

  static normalizeTopic(topic: string): string {
    return topic.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9-_.~%]/g, '');
  }

  async subscribeToTopic(token: string, topic: string): Promise<any> {
    const accessToken = await this.getAccessToken();
    const normalizedTopic = FirebaseLite.normalizeTopic(topic);
    const url = 'https://iid.googleapis.com/iid/v1:batchAdd';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'access_token_auth': 'true'
      },
      body: JSON.stringify({
        to: `/topics/${normalizedTopic}`,
        registration_tokens: [token]
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`FCM Subscribe error:`, error);
      throw new Error(`FCM Subscribe error ${response.status}: ${error}`);
    }

    return await response.json();
  }

  async unsubscribeFromTopic(token: string, topic: string): Promise<any> {
    const accessToken = await this.getAccessToken();
    const normalizedTopic = FirebaseLite.normalizeTopic(topic);
    const url = 'https://iid.googleapis.com/iid/v1:batchRemove';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'access_token_auth': 'true'
      },
      body: JSON.stringify({
        to: `/topics/${normalizedTopic}`,
        registration_tokens: [token]
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`FCM Unsubscribe error:`, error);
      throw new Error(`FCM Unsubscribe error ${response.status}: ${error}`);
    }

    return await response.json();
  }

  async sendFcmMessage(message: any): Promise<any> {
    const token = await this.getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${this.serviceAccount.project_id}/messages:send`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    return await response.json();
  }

  private simplifyFirestoreObject(obj: any): any {
    const result: any = {};
    if (!obj.fields) return result;
    for (const [key, value] of Object.entries(obj.fields)) {
      result[key] = this.decodeFirestoreValue(value);
    }
    return result;
  }

  private decodeFirestoreValue(value: any): any {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return parseInt(value.integerValue);
    if (value.doubleValue !== undefined) return value.doubleValue;
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.timestampValue !== undefined) return value.timestampValue;
    if (value.mapValue !== undefined) return this.simplifyFirestoreObject(value.mapValue);
    if (value.arrayValue !== undefined) {
      return (value.arrayValue.values || []).map((v: any) => this.decodeFirestoreValue(v));
    }
    return null;
  }

  private encodeFirestoreFields(fields: any): any {
      const encoded: any = {};
      for (const [key, value] of Object.entries(fields)) {
          encoded[key] = this.encodeFirestoreValue(value);
      }
      return encoded;
  }

  private encodeFirestoreValue(value: any): any {
      if (typeof value === 'string') return { stringValue: value };
      if (typeof value === 'number') {
          if (Number.isInteger(value)) return { integerValue: value.toString() };
          return { doubleValue: value };
      }
      if (typeof value === 'boolean') return { booleanValue: value };
      if (value instanceof Date) return { timestampValue: value.toISOString() };
      if (Array.isArray(value)) {
          return { arrayValue: { values: value.map(v => this.encodeFirestoreValue(v)) } };
      }
      if (typeof value === 'object' && value !== null) {
          return { mapValue: { fields: this.encodeFirestoreFields(value) } };
      }
      return { nullValue: null };
  }
}
