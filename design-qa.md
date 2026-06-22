# SignVision Layout QA

- Date: 2026-06-22
- Reference: user screenshot with compact practice card and corrected robot position.
- Prototype capture: `D:\ZD_材料\项目案例\手语项目\signvision-layout-check-latest.png`

## Checks

- Practice card is smaller and remains in the upper-right corner.
- Practice card now keeps only the illustration, category, label, progress, and navigation controls.
- Waiting/recognizing detail block is removed from the card; success appears only as a compact transient state.
- Robot stage is smaller and shifted left to better balance camera, robot, and practice card.
- Desktop layout does not overlap at 1920 x 900.
- Build verification passed with `npm run build`.

final result: passed
