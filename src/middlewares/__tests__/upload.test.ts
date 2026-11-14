/**
 * Client feedback R1 §3.2: CV uploads from iPad failed. Word CVs were let
 * through by the picker but rejected by the API, and iPadOS can send files
 * from the Files app with a generic MIME type. Errors also surfaced as 500s.
 */
import express from 'express';
import request from 'supertest';
import { uploadCvDocument, uploadDocument } from '../upload';
import { errorHandler } from '../errorHandler';
import { v2 as cloudinary } from 'cloudinary';
import mainApp from '../../app';
import { documentUploadOptions, deleteFromCloudinary } from '../../utils/cloudinary.util';

const app = express();
app.post('/cv', uploadCvDocument, (req, res) => { res.json({ name: req.file?.originalname }); });
app.post('/pdf', uploadDocument, (req, res) => { res.json({ name: req.file?.originalname }); });
app.use(errorHandler);

const send = (route: string, filename: string, contentType: string, size = 10) =>
  request(app).post(route).attach('file', Buffer.alloc(size, 1), { filename, contentType });

beforeAll(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); });

describe('CV upload filter', () => {
  it.each([
    ['cv.pdf', 'application/pdf'],
    ['cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['cv.doc', 'application/msword'],
    ['CV.PDF', 'application/octet-stream'], // iPad Files app
    ['cv.docx', 'application/octet-stream'],
  ])('accepts %s (%s)', async (filename, type) => {
    const res = await send('/cv', filename, type);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(filename);
  });

  it.each([
    ['cv.exe', 'application/octet-stream'],
    ['cv.html', 'text/html'],
    ['cv.pdf', 'text/html'], // explicit wrong type is not overridden by extension
  ])('rejects %s (%s) with 400', async (filename, type) => {
    const res = await send('/cv', filename, type);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Unsupported file type/);
  });

  it('PDF-only routes still reject Word files', async () => {
    expect((await send('/pdf', 'cv.docx', 'application/msword')).status).toBe(400);
    expect((await send('/pdf', 'doc.pdf', 'application/octet-stream')).status).toBe(200);
  });

  it('CV route allows up to 10MB (scanned iPad PDFs)', async () => {
    expect((await send('/cv', 'cv.pdf', 'application/pdf', 8 * 1024 * 1024)).status).toBe(200);
  });

  it('oversized file is a 400, not a 500', async () => {
    const res = await send('/cv', 'cv.pdf', 'application/pdf', 11 * 1024 * 1024);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too large/);
  });
});

describe('documentUploadOptions', () => {
  it('stores Word files as raw with the extension in the public id', () => {
    const o = documentUploadOptions('My CV.DOCX');
    expect(o.resourceType).toBe('raw');
    expect(o.filename).toMatch(/^[0-9a-f-]{36}\.docx$/);
  });
  it('leaves PDFs on the default path', () => {
    expect(documentUploadOptions('cv.pdf')).toEqual({});
  });
});

describe('deleteFromCloudinary', () => {
  afterEach(() => jest.restoreAllMocks());
  const mockDestroy = (byType: Record<string, string>) =>
    jest.spyOn(cloudinary.uploader, 'destroy').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (_id: string, opts: any) => ({ result: byType[opts.resource_type] ?? 'not found' })) as any,
    );

  it('finds a PDF stored as an image asset (was silently skipped as raw)', async () => {
    const spy = mockDestroy({ image: 'ok' });
    expect((await deleteFromCloudinary('abjad/resumes/abc')).result).toBe('ok');
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('falls back to raw when image misses', async () => {
    const spy = mockDestroy({ raw: 'ok' });
    expect((await deleteFromCloudinary('abjad/resumes/legacy')).result).toBe('ok');
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it('goes straight to raw for Word files', async () => {
    const spy = mockDestroy({ raw: 'ok' });
    await deleteFromCloudinary('abjad/resumes/x.docx');
    expect(spy).toHaveBeenCalledWith('abjad/resumes/x.docx', { resource_type: 'raw' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('generic /api/upload is gone', () => {
  it('DELETE /api/upload no longer exists', async () => {
    const res = await request(mainApp).delete('/api/upload').send({ publicId: 'abjad/resumes/victim' });
    expect(res.status).toBe(404);
  });
});
