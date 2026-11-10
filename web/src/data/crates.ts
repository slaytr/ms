import type { Crate } from '../lib/loot-box';

/**
 * Cash-shop crates for the NX loot-box simulator. Items and rates are Nexon's published list
 * (nexon.com/maplestory/general-post/46331), in that order; icons are `/nx/<id>.png` (public/nx).
 * Nexon rounds each rate, so the sum may not be exactly 100%.
 */
export const MYSTERY_FASHION_CRATE: Crate = {
  iconId: 5222000,
  name: 'Mystery Fashion Crate',
  price1: 3500,
  price11: 35_000,
  items: [
    { id: 1007074, name: 'Woodsman Hat', rate: 3 },
    { id: 1047135, name: 'Bomber Jacket', rate: 2 },
    { id: 1067174, name: 'Patched Denim Jeans', rate: 2 },
    { id: 1027028, name: 'Green Sports Goggles', rate: 1 },
    { id: 1047094, name: 'Pelvis Hoodie', rate: 2 },
    { id: 1047095, name: 'Red Hooded Coat', rate: 2 },
    { id: 1067079, name: 'Bunny-Padded Snowboard Pants', rate: 2 },
    { id: 1702019, name: 'Pillow', rate: 1 },
    { id: 1007132, name: 'Grey Visor Beanie', rate: 2 },
    { id: 1057094, name: 'Black Fur Wrap Coat', rate: 2 },
    { id: 1057089, name: 'Blue Kitty Hood', rate: 2 },
    { id: 1077058, name: 'Mix-n-Match Sneakers', rate: 3 },
    { id: 1007043, name: 'Starry Sky Blue Beanie', rate: 3 },
    { id: 1077030, name: 'Big Rabbit Feet', rate: 2 },
    { id: 1702026, name: "White Rabbit's Foot", rate: 1 },
    { id: 1007072, name: 'Olive Beanie', rate: 2 },
    { id: 1017015, name: 'Bandage Strip', rate: 1 },
    { id: 1007274, name: 'Pink Knitted Gumball', rate: 3 },
    { id: 1047015, name: 'Pink Snowboard Top', rate: 2 },
    { id: 1067013, name: 'Pink Snowboard Pants', rate: 2 },
    { id: 1077023, name: 'Pink Galoshes', rate: 3 },
    { id: 1007053, name: 'Bunny Hat', rate: 2 },
    { id: 1077020, name: 'Bunny Slippers', rate: 1 },
    { id: 1702017, name: 'Pink Rabbit Puppet', rate: 1 },
    { id: 1057057, name: 'Bunny Costume', rate: 2 },
    { id: 1007103, name: 'Old School Uniform Hat', rate: 3 },
    { id: 1047044, name: 'Old School Blazer', rate: 1 },
    { id: 1047075, name: 'Old School Uniform Top', rate: 2 },
    { id: 1067045, name: 'Old School Uniform Pants', rate: 1 },
    { id: 1067065, name: 'Old School Uniform Skirt', rate: 3 },
    { id: 1077087, name: 'White High Top', rate: 3 },
    { id: 1027022, name: 'Medical Eye Patch', rate: 1 },
    { id: 1107016, name: 'My Buddy Rex', rate: 2 },
    { id: 1057128, name: 'Blue Snow Flower Wear', rate: 2 },
    { id: 1007137, name: 'Superstar Headphones', rate: 1 },
    { id: 1057095, name: 'Kitty Hoodie', rate: 2 },
    { id: 1047089, name: 'Pink Down Parka', rate: 2 },
    { id: 1067078, name: 'Amorian Pink Skirt', rate: 2 },
    { id: 1017088, name: 'Ice Cold Red', rate: 2 },
    { id: 1007133, name: 'Teddy Bear Headgear', rate: 2 },
    { id: 1057099, name: 'Teddy Bear Costume', rate: 2 },
    { id: 1077053, name: 'Teddy Bear Shoes', rate: 3 },
    { id: 1702013, name: 'Teddy Bear', rate: 1 },
    { id: 1087019, name: 'Teddy Bear Gloves', rate: 3 },
    { id: 1107013, name: 'Cuddle Bear', rate: 1 },
    { id: 1112217, name: 'Teddy Bear Chat Ring', rate: 1 },
    { id: 1007058, name: 'Blue Pajama Hat', rate: 2 },
    { id: 1047021, name: 'Blue Polka-Dot Pajama Top', rate: 3 },
    { id: 1067018, name: 'Blue Polka-Dot Pajama Pants', rate: 3 },
    { id: 1077018, name: 'Blue Marble Slippers', rate: 3 },
  ],
};

/** Every crate the simulator offers. */
export const CRATES: readonly Crate[] = [MYSTERY_FASHION_CRATE];
