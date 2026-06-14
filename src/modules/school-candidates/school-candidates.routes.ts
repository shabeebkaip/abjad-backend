import { Router } from 'express';
import { schoolCandidatesController } from './school-candidates.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

router.use(authenticate, authorize('school'));

// Search & profile
router.get('/', schoolCandidatesController.searchCandidates.bind(schoolCandidatesController));
// SRD 3.3.5 — bulk PDF export of selected candidates
router.post('/export-pdf', schoolCandidatesController.exportPdf.bind(schoolCandidatesController));
router.get('/:teacherId', schoolCandidatesController.getCandidateProfile.bind(schoolCandidatesController));

// Notes on a candidate
router.post('/:teacherId/notes', schoolCandidatesController.addNote.bind(schoolCandidatesController));
router.get('/:teacherId/notes', schoolCandidatesController.getNotes.bind(schoolCandidatesController));
router.patch('/notes/:noteId', schoolCandidatesController.updateNote.bind(schoolCandidatesController));
router.delete('/notes/:noteId', schoolCandidatesController.deleteNote.bind(schoolCandidatesController));

export default router;
