import {
  resolveMediaMimeType,
  type PostizChannel,
  type PostizMedia,
  type PostizPayload,
} from 'src/shared/marketing/publish';

const POSTIZ_API_URL = 'https://api.postiz.com/public/v1';
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;

export type MediaSource = {
  url: string;
  label: string | null;
  extension: string | null;
};

export type PostizPostResult = { ok: boolean; status: number; reply: unknown };

// The message is stored in publishResult, so it never holds the key or a signed URL.
export class PostizError extends Error {}

const readReply = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const listPostizChannels = async (input: {
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<PostizChannel[]> => {
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(`${POSTIZ_API_URL}/integrations`, {
      headers: { Authorization: input.apiKey },
    });
  } catch {
    throw new PostizError('Could not reach Postiz to read the channels');
  }

  const reply = await readReply(response);

  if (!response.ok || !Array.isArray(reply)) {
    throw new PostizError(
      `Postiz did not return the channels (HTTP ${response.status})`,
    );
  }

  return reply.flatMap((channel: unknown) =>
    isRecord(channel) &&
    typeof channel.id === 'string' &&
    typeof channel.identifier === 'string'
      ? [
          {
            id: channel.id,
            identifier: channel.identifier,
            disabled: channel.disabled === true,
          },
        ]
      : [],
  );
};

// The CRM file address can be internal or expire, so the bytes go to Postiz at publish time.
export const uploadPostizMedia = async (input: {
  apiKey: string;
  media: MediaSource;
  fetchImpl?: typeof fetch;
}): Promise<PostizMedia> => {
  const fetchImpl = input.fetchImpl ?? fetch;
  let fileResponse: Response;

  try {
    fileResponse = await fetchImpl(input.media.url);
  } catch {
    throw new PostizError('Could not download the media file');
  }

  if (!fileResponse.ok) {
    throw new PostizError(
      `Media file download responded HTTP ${fileResponse.status}`,
    );
  }

  const bytes = await fileResponse.arrayBuffer();

  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    throw new PostizError('Media file is larger than 30 MB');
  }

  const mimeType = resolveMediaMimeType({
    contentType: fileResponse.headers.get('content-type'),
    extension: input.media.extension,
  });
  const form = new FormData();

  form.append(
    'file',
    new Blob([bytes], { type: mimeType }),
    input.media.label ?? 'media',
  );

  let uploadResponse: Response;

  try {
    uploadResponse = await fetchImpl(`${POSTIZ_API_URL}/upload`, {
      method: 'POST',
      headers: { Authorization: input.apiKey },
      body: form,
    });
  } catch {
    throw new PostizError('Could not reach Postiz media upload');
  }

  const reply = await readReply(uploadResponse);

  if (
    !uploadResponse.ok ||
    !isRecord(reply) ||
    typeof reply.id !== 'string' ||
    typeof reply.path !== 'string'
  ) {
    throw new PostizError(
      `Postiz media upload failed (HTTP ${uploadResponse.status})`,
    );
  }

  return { id: reply.id, path: reply.path };
};

// Throws only on a network failure. The caller must not log the error text with the key.
export const sendPostizPost = async (input: {
  apiKey: string;
  payload: PostizPayload;
  fetchImpl?: typeof fetch;
}): Promise<PostizPostResult> => {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${POSTIZ_API_URL}/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: input.apiKey,
    },
    body: JSON.stringify(input.payload),
  });
  const reply = await readReply(response);

  return {
    ok: response.ok && Array.isArray(reply),
    status: response.status,
    reply,
  };
};
