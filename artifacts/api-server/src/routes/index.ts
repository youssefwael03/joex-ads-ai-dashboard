import { Router, type IRouter } from "express";
import healthRouter from "./health";
import metaRouter from "./meta";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(metaRouter);
router.use(aiRouter);

export default router;
