import math
import uuid
from typing import List, Optional, Tuple
from ..models.schemas import (
    BuildingRequirements, BuildingModel, OccupancyType, RoomType,
    Room, Wall, Door, Window, Column, Point2D
)

SETBACK_FRONT = 4.0
SETBACK_BACK = 3.0
SETBACK_SIDE = 2.0
WALL_THICKNESS = 0.2
FLOOR_HEIGHT = 3.2
CORRIDOR_WIDTH = 1.5
COLUMN_SPACING = 6.0


def _uid() -> str:
    return str(uuid.uuid4())


def _make_room(
    room_type: RoomType,
    name: str,
    floor: int,
    x: float, y: float,
    w: float, h: float
) -> Room:
    return Room(
        id=_uid(),
        type=room_type,
        name=name,
        floor=floor,
        polygon=[
            Point2D(x=x, y=y),
            Point2D(x=x + w, y=y),
            Point2D(x=x + w, y=y + h),
            Point2D(x=x, y=y + h),
        ],
        area=round(w * h, 2)
    )


def _make_wall(
    start: Tuple[float, float],
    end: Tuple[float, float],
    floor: int,
    is_external: bool = False
) -> Wall:
    return Wall(
        id=_uid(),
        start=Point2D(x=start[0], y=start[1]),
        end=Point2D(x=end[0], y=end[1]),
        floor=floor,
        thickness=WALL_THICKNESS,
        height=FLOOR_HEIGHT - 0.2,
        is_external=is_external
    )


def _make_door(wall: Wall, floor: int, offset: float = 0.5) -> Door:
    dx = wall.end.x - wall.start.x
    dy = wall.end.y - wall.start.y
    length = math.hypot(dx, dy)
    t = min(offset / length, 0.9)
    return Door(
        id=_uid(),
        wall_id=wall.id,
        position=Point2D(
            x=wall.start.x + dx * t,
            y=wall.start.y + dy * t
        ),
        width=0.9,
        height=2.1,
        floor=floor
    )


def _internal_door(wall: Wall, floor: int, frac: float = 0.5) -> Optional[Door]:
    """Create a door at the fractional midpoint of a wall, but only if the wall
    is long enough to accommodate one (>= 1.2 m)."""
    dx = wall.end.x - wall.start.x
    dy = wall.end.y - wall.start.y
    length = math.hypot(dx, dy)
    if length < 1.2:
        return None
    return _make_door(wall, floor, length * frac)


def _make_window(wall: Wall, floor: int, t: float = 0.5) -> Window:
    dx = wall.end.x - wall.start.x
    dy = wall.end.y - wall.start.y
    return Window(
        id=_uid(),
        wall_id=wall.id,
        position=Point2D(
            x=wall.start.x + dx * t,
            y=wall.start.y + dy * t
        ),
        width=1.2,
        height=1.2,
        sill_height=0.9,
        floor=floor
    )


def _floor_perimeter_walls(bw: float, bd: float, ox: float, oy: float, floor: int) -> List[Wall]:
    corners = [
        (ox, oy), (ox + bw, oy),
        (ox + bw, oy + bd), (ox, oy + bd)
    ]
    walls = []
    for i in range(4):
        s = corners[i]
        e = corners[(i + 1) % 4]
        walls.append(_make_wall(s, e, floor, is_external=True))
    return walls


def _windows_on_wall(wall: Wall, floor: int) -> List[Window]:
    length = math.hypot(
        wall.end.x - wall.start.x,
        wall.end.y - wall.start.y
    )
    count = max(1, int(length / 3.5))
    windows = []
    for i in range(count):
        t = (i + 1) / (count + 1)
        windows.append(_make_window(wall, floor, t))
    return windows


def _column_grid(bw: float, bd: float, ox: float, oy: float) -> List[Column]:
    columns = []
    nx = max(2, round(bw / COLUMN_SPACING) + 1)
    ny = max(2, round(bd / COLUMN_SPACING) + 1)
    xs = [ox + i * (bw / (nx - 1)) for i in range(nx)]
    ys = [oy + j * (bd / (ny - 1)) for j in range(ny)]
    for x in xs:
        for y in ys:
            columns.append(Column(id=_uid(), position=Point2D(x=round(x, 3), y=round(y, 3))))
    return columns


def _plan_residential_ground(
    bw: float, bd: float, ox: float, oy: float,
    rooms_req, floor: int
) -> Tuple[List[Room], List[Wall], List[Door]]:
    rooms: List[Room] = []
    internal_walls: List[Wall] = []
    doors: List[Door] = []

    # Living / Dining band across the front (no separate entry room)
    living_h = bd * 0.42
    living_w = bw * 0.55
    rooms.append(_make_room(RoomType.LIVING, "Living Room", floor, ox, oy, living_w, living_h))

    dining_w = bw - living_w
    rooms.append(_make_room(RoomType.DINING, "Dining Room", floor, ox + living_w, oy, dining_w, living_h))

    # Service band at the back
    kitchen_y = oy + living_h
    kitchen_h = bd - living_h
    kitchen_w = bw * 0.38
    rooms.append(_make_room(RoomType.KITCHEN, "Kitchen", floor, ox, kitchen_y, kitchen_w, kitchen_h))

    bath_w = bw * 0.22
    rooms.append(_make_room(RoomType.BATHROOM, "Bathroom", floor, ox + kitchen_w, kitchen_y, bath_w, kitchen_h))

    stair_w = bw - kitchen_w - bath_w
    stair_x = ox + kitchen_w + bath_w
    rooms.append(_make_room(RoomType.STAIRCASE, "Staircase", floor, stair_x, kitchen_y, stair_w, kitchen_h))

    # Internal dividing walls
    wall_living_dining = _make_wall(
        (ox + living_w, oy), (ox + living_w, oy + living_h), floor
    )
    wall_front_back = _make_wall(
        (ox, oy + living_h), (ox + bw, oy + living_h), floor
    )
    wall_kitchen_bath = _make_wall(
        (ox + kitchen_w, kitchen_y), (ox + kitchen_w, oy + bd), floor
    )
    wall_bath_stair = _make_wall(
        (ox + kitchen_w + bath_w, kitchen_y), (ox + kitchen_w + bath_w, oy + bd), floor
    )
    internal_walls.extend([wall_living_dining, wall_front_back, wall_kitchen_bath, wall_bath_stair])

    # Internal doors — one per dividing wall (skipped if wall is too short)
    for wall in internal_walls:
        door = _internal_door(wall, floor, 0.5)
        if door is not None:
            doors.append(door)

    return rooms, internal_walls, doors


def _plan_residential_upper(
    bw: float, bd: float, ox: float, oy: float,
    floor: int, bedroom_count: int
) -> Tuple[List[Room], List[Wall], List[Door]]:
    rooms: List[Room] = []
    internal_walls: List[Wall] = []
    doors: List[Door] = []

    corridor_y = oy + bd / 2 - CORRIDOR_WIDTH / 2
    rooms.append(_make_room(RoomType.CORRIDOR, "Corridor", floor, ox, corridor_y, bw, CORRIDOR_WIDTH))

    stair_w = 3.0
    rooms.append(_make_room(RoomType.STAIRCASE, "Staircase", floor, ox, oy, stair_w, bd / 2 - CORRIDOR_WIDTH / 2))

    bath_w = 3.0
    bath_h = bd / 2 - CORRIDOR_WIDTH / 2
    rooms.append(_make_room(RoomType.BATHROOM, "Bathroom", floor,
                             ox + bw - bath_w, oy, bath_w, bath_h))

    # Bedrooms on front side of corridor
    front_depth = bd / 2 - CORRIDOR_WIDTH / 2
    bed_front_count = max(1, bedroom_count // 2 + bedroom_count % 2)
    available_w_front = bw - stair_w
    bed_w_front = available_w_front / bed_front_count
    for i in range(bed_front_count):
        x = ox + stair_w + i * bed_w_front
        rooms.append(_make_room(RoomType.BEDROOM, f"Bedroom {i + 1}", floor,
                                 x, oy, bed_w_front, front_depth))
        # Vertical bedroom-separating wall
        bed_sep_wall = _make_wall(
            (x, oy), (x, oy + front_depth), floor
        )
        internal_walls.append(bed_sep_wall)
        door = _internal_door(bed_sep_wall, floor, 0.5)
        if door is not None:
            doors.append(door)

    # Bedrooms on back side of corridor
    back_depth = bd / 2 - CORRIDOR_WIDTH / 2
    back_y = corridor_y + CORRIDOR_WIDTH
    bed_back_count = max(0, bedroom_count - bed_front_count)
    remaining_w = bw - bath_w
    if bed_back_count > 0:
        bed_w_back = remaining_w / bed_back_count
        for i in range(bed_back_count):
            x = ox + i * bed_w_back
            rooms.append(_make_room(RoomType.BEDROOM, f"Bedroom {bed_front_count + i + 1}", floor,
                                     x, back_y, bed_w_back, back_depth))
            bed_sep_wall = _make_wall(
                (x, back_y), (x, back_y + back_depth), floor
            )
            internal_walls.append(bed_sep_wall)
            door = _internal_door(bed_sep_wall, floor, 0.5)
            if door is not None:
                doors.append(door)

    # Corridor walls
    corridor_wall_top = _make_wall(
        (ox, corridor_y), (ox + bw, corridor_y), floor
    )
    corridor_wall_bottom = _make_wall(
        (ox, corridor_y + CORRIDOR_WIDTH), (ox + bw, corridor_y + CORRIDOR_WIDTH), floor
    )
    internal_walls.extend([corridor_wall_top, corridor_wall_bottom])

    # Door on each corridor wall at its centre
    for cw in (corridor_wall_top, corridor_wall_bottom):
        door = _internal_door(cw, floor, 0.5)
        if door is not None:
            doors.append(door)

    return rooms, internal_walls, doors


def _plan_office_ground(
    bw: float, bd: float, ox: float, oy: float, floor: int
) -> Tuple[List[Room], List[Wall], List[Door]]:
    rooms: List[Room] = []
    internal_walls: List[Wall] = []
    doors: List[Door] = []

    lobby_d = bd * 0.25
    rooms.append(_make_room(RoomType.LOBBY, "Main Lobby", floor, ox, oy, bw, lobby_d))

    office_y = oy + lobby_d
    office_h = bd - lobby_d
    left_w = bw * 0.65
    rooms.append(_make_room(RoomType.OFFICE, "Open Office", floor, ox, office_y, left_w, office_h))

    rooms.append(_make_room(RoomType.MEETING_ROOM, "Meeting Room", floor,
                             ox + left_w, office_y, bw - left_w, office_h * 0.5))
    rooms.append(_make_room(RoomType.BATHROOM, "Bathroom", floor,
                             ox + left_w, office_y + office_h * 0.5,
                             bw - left_w, office_h * 0.5))

    # Dividing walls
    wall_lobby_office = _make_wall((ox, oy + lobby_d), (ox + bw, oy + lobby_d), floor)
    wall_office_right = _make_wall((ox + left_w, office_y), (ox + left_w, oy + bd), floor)
    wall_meeting_bath = _make_wall(
        (ox + left_w, office_y + office_h * 0.5), (ox + bw, office_y + office_h * 0.5), floor
    )
    internal_walls.extend([wall_lobby_office, wall_office_right, wall_meeting_bath])

    # Internal doors — lobby to office, office to meeting room
    door_lobby_office = _internal_door(wall_lobby_office, floor, 0.5)
    if door_lobby_office is not None:
        doors.append(door_lobby_office)

    door_office_meeting = _internal_door(wall_office_right, floor, 0.5)
    if door_office_meeting is not None:
        doors.append(door_office_meeting)

    return rooms, internal_walls, doors


def _plan_office_upper(
    bw: float, bd: float, ox: float, oy: float, floor: int
) -> Tuple[List[Room], List[Wall], List[Door]]:
    rooms: List[Room] = []
    internal_walls: List[Wall] = []
    doors: List[Door] = []

    stair_w = 3.0
    rooms.append(_make_room(RoomType.STAIRCASE, "Staircase", floor, ox, oy, stair_w, bd))

    corridor_w = CORRIDOR_WIDTH
    rooms.append(_make_room(RoomType.CORRIDOR, "Corridor", floor,
                             ox + stair_w, oy, corridor_w, bd))

    content_x = ox + stair_w + corridor_w
    content_w = bw - stair_w - corridor_w
    office_h = bd * 0.6
    rooms.append(_make_room(RoomType.OFFICE, "Open Office", floor,
                             content_x, oy, content_w, office_h))
    rooms.append(_make_room(RoomType.MEETING_ROOM, "Meeting Room", floor,
                             content_x, oy + office_h, content_w * 0.6, bd - office_h))
    rooms.append(_make_room(RoomType.BATHROOM, "Bathroom", floor,
                             content_x + content_w * 0.6, oy + office_h,
                             content_w * 0.4, bd - office_h))

    # Dividing walls
    wall_stair_corridor = _make_wall((ox + stair_w, oy), (ox + stair_w, oy + bd), floor)
    wall_corridor_office = _make_wall((ox + stair_w + corridor_w, oy), (ox + stair_w + corridor_w, oy + bd), floor)
    wall_office_lower = _make_wall((content_x, oy + office_h), (content_x + content_w, oy + office_h), floor)
    wall_meeting_bath = _make_wall(
        (content_x + content_w * 0.6, oy + office_h), (content_x + content_w * 0.6, oy + bd), floor
    )
    internal_walls.extend([wall_stair_corridor, wall_corridor_office, wall_office_lower, wall_meeting_bath])

    # Internal doors — stair to corridor, corridor to office
    door_stair_corridor = _internal_door(wall_stair_corridor, floor, 0.5)
    if door_stair_corridor is not None:
        doors.append(door_stair_corridor)

    door_corridor_office = _internal_door(wall_corridor_office, floor, 0.5)
    if door_corridor_office is not None:
        doors.append(door_corridor_office)

    return rooms, internal_walls, doors


def generate_building_model(requirements: BuildingRequirements) -> BuildingModel:
    bw = requirements.site_width - SETBACK_SIDE * 2
    bd = requirements.site_depth - SETBACK_FRONT - SETBACK_BACK

    ox = SETBACK_SIDE
    oy = SETBACK_FRONT

    all_rooms: List[Room] = []
    all_walls: List[Wall] = []
    all_doors: List[Door] = []
    all_windows: List[Window] = []

    bedroom_count = sum(
        r.count for r in requirements.rooms if r.type == RoomType.BEDROOM
    ) or 3

    for floor in range(requirements.floors):
        # Perimeter walls
        perimeter = _floor_perimeter_walls(bw, bd, ox, oy, floor)
        all_walls.extend(perimeter)

        # Windows on external walls
        for wall in perimeter:
            all_windows.extend(_windows_on_wall(wall, floor))

        # Door on front wall (index 0 = south-facing)
        front_wall = perimeter[0]
        all_doors.append(_make_door(front_wall, floor, bw / 2))

        # Internal layout
        if requirements.building_type == OccupancyType.OFFICE:
            if floor == 0:
                rooms, iw, floor_doors = _plan_office_ground(bw, bd, ox, oy, floor)
            else:
                rooms, iw, floor_doors = _plan_office_upper(bw, bd, ox, oy, floor)
        else:
            if floor == 0:
                rooms, iw, floor_doors = _plan_residential_ground(bw, bd, ox, oy, requirements.rooms, floor)
            else:
                rooms, iw, floor_doors = _plan_residential_upper(bw, bd, ox, oy, floor, bedroom_count)

        all_rooms.extend(rooms)
        all_walls.extend(iw)
        all_doors.extend(floor_doors)

    # Structural columns (ground floor only)
    columns = _column_grid(bw, bd, ox, oy)

    return BuildingModel(
        id=_uid(),
        requirements=requirements,
        rooms=all_rooms,
        walls=all_walls,
        doors=all_doors,
        windows=all_windows,
        columns=columns,
        floor_height=FLOOR_HEIGHT
    )
