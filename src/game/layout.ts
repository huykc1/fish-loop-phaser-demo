/** Vị trí HUD và lớp hiển thị (toạ độ thiết kế 1080x1920, theo ảnh mẫu art/reference). */
export const HUD = {
    levelPill: { x: 262, y: 148 },
    counter: { x: 540, y: 148 },
    gear: { x: 905, y: 150 },
    buttonsY: 1790,
    undoX: 340,
    shuffleX: 540,
    addBusX: 740,
};

export const DEPTH = {
    water: 0,
    caustics: 1,
    rays: 2,
    frame: 3,
    ambient: 4,
    floor: 10,
    pipeShadow: 12,
    pipeGlass: 13,
    pipeWater: 14,
    ripples: 15,
    fish: 16,
    pipeBubbles: 17,
    pipeShine: 18,
    joints: 19,
    danger: 20,
    props: 21,
    spare: 25,
    bus: 30,
    flying: 40,
    fx: 45,
    check: 50,
    hud: 100,
    toast: 150,
    popup: 200,
};

export const PIPE_W = 100;
export const FISH_PIPE_SCALE = 0.2;
export const FISH_TANK_SCALE = 0.18;
export const FISH_FLY_SCALE = 0.22;
