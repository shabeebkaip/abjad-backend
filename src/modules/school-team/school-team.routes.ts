import { Router } from 'express';
import { schoolTeamController } from './school-team.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

router.use(authenticate, authorize('school'));

router.get('/', schoolTeamController.listMembers.bind(schoolTeamController));
router.post('/', schoolTeamController.addMember.bind(schoolTeamController));
router.get('/me', schoolTeamController.getMyRole.bind(schoolTeamController));
router.patch('/:memberId/role', schoolTeamController.updateRole.bind(schoolTeamController));
router.delete('/:memberId', schoolTeamController.removeMember.bind(schoolTeamController));

export default router;
