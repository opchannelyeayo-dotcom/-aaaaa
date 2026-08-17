import { Router, type IRouter } from "express";
import healthRouter from "./health";
import rhetoricRouter from "./rhetoric";
import recordsRouter from "./records";
import productsRouter from "./products";
import nutrientsRouter from "./nutrients";
import healthFoodStatsRouter from "./health-food-stats";
import nutrientTermsRouter from "./nutrient-terms";
import lifeStageNutrientsRouter from "./life-stage-nutrients";
import riskTagsPublicRouter from "./risk-tags";
import urlScanRouter from "./url-scan";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rhetoricRouter);
router.use(recordsRouter);
router.use(productsRouter);
router.use(nutrientsRouter);
router.use(healthFoodStatsRouter);
router.use(nutrientTermsRouter);
router.use(lifeStageNutrientsRouter);
router.use(riskTagsPublicRouter);
router.use(urlScanRouter);
router.use(adminRouter);

export default router;
