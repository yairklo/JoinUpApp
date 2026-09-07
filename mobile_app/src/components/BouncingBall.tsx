import LoadingMotif, { BouncingBallMotif } from "./loading/LoadingMotif";

export { BouncingBallMotif };
export default function BouncingBall({ size = 40 }: { size?: number }) {
    return <LoadingMotif id="bouncing-ball" size={size} />;
}
