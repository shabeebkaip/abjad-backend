import { Request, Response } from 'express';

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `The requested endpoint "${req.originalUrl}" does not exist. Please check your URL and try again.`,
  });
};
